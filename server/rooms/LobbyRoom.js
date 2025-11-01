import { Room } from 'colyseus';
import { randomBytes } from 'crypto';
import { matchMaker } from '@colyseus/core';

const MATCH_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const MATCH_CHECK_INTERVAL_MS = 1000;

export class LobbyRoom extends Room {
  onCreate(options) {
    this.players = {};         
    this.squads = new Map();   
    this.addressIndex = new Map();
    this.matchmakingQueue = [];

    this.matchmakingInterval = setInterval(() => this._processMatchQueue(), MATCH_CHECK_INTERVAL_MS);

    this.onMessage('register', (client, payload) => {
      const address = payload.address ? payload.address.toLowerCase() : null;
      const displayName = payload.displayName?.trim() || (address ? this._shortAddress(address) : 'Guest');
      const baseName = payload.baseName?.trim() || null;

      // Update or create player entry
      const player = this.players[client.sessionId] || {};
      player.address = address;
      player.displayName = displayName;
      player.baseName = baseName;  // New: Store baseName
      player.inSquad = false;
      player.squadId = null;

      this.players[client.sessionId] = player;

      // Index address for invite-by-wallet
      if (address) {
        this.addressIndex.set(address, client.sessionId);
      }

      console.log(`[Lobby] Registered player: ${displayName} (${client.sessionId})`);
      this._broadcastLobby();
    });

    // === INVITE ===
    this.onMessage('invite', (client, payload) => {
      const toSessionId = payload?.toSessionId;
      const toAddress = payload?.toAddress?.toLowerCase();
      let targetSession = null;

      if (toSessionId) {
        targetSession = toSessionId;
      } else if (toAddress && this.addressIndex.has(toAddress)) {
        targetSession = this.addressIndex.get(toAddress);
      }

      if (!targetSession || !this.players[targetSession]) {
        client.send('error', { message: 'Player not online or not found' });
        return;
      }

      const targetClient = this.clients.find(c => c.sessionId === targetSession);
      if (targetClient) {
        targetClient.send('invite', {
          fromSession: client.sessionId,
          fromAddress: this._getAddr(client.sessionId),
          fromName: this._getName(client.sessionId),
        });
      }
    });

    // === JOIN SQUAD ===
    this.onMessage('join_squad', (client, payload) => {
      const sess = client.sessionId;
      let squadId = payload?.squadId;
      const leaderId = payload?.leaderId;

      // Case 1: Join by squadId
      if (squadId && this.squads.has(squadId)) {
        const sq = this.squads.get(squadId);
        if (sq.members.size >= 3) {
          client.send('error', { message: 'Squad is full (max 3)' });
          return;
        }
        sq.members.add(sess);
        sq.ready.set(sess, false); // members start unready
        this._setPlayerSquad(sess, squadId);
        this._broadcastLobby();
        return;
      }

      // Case 2: Join/create via leader
      if (leaderId) {
        squadId = this._ensureSquadForLeader(leaderId);
      } else {
        squadId = this._createSquad();
      }

      const sq = this.squads.get(squadId);
      if (sq.members.size >= 3) {
        client.send('error', { message: 'Squad full' });
        return;
      }

      sq.members.add(sess);
      sq.ready.set(sess, false);
      this._setPlayerSquad(sess, squadId);
      this._broadcastLobby();
    });

    // === LEAVE SQUAD ===
    this.onMessage('leave_squad', (client, payload) => {
      const sess = client.sessionId;
      const sId = payload?.squadId || this.players[sess]?.squadId;

      if (!sId || !this.squads.has(sId)) {
        this._setPlayerSquad(sess, null);
        this._broadcastLobby();
        return;
      }

      const sq = this.squads.get(sId);
      sq.members.delete(sess);
      sq.ready.delete(sess);

      // Reassign leader if needed
      if (sq.leader === sess) {
        const next = sq.members.values().next().value;
        sq.leader = next || null;
        if (next) sq.ready.set(next, true);
      }

      // Delete empty squad
      if (sq.members.size === 0) {
        this.squads.delete(sId);
      }

      this._setPlayerSquad(sess, null);
      this._broadcastLobby();
    });

    // === SET READY ===
    this.onMessage('set_ready', (client, payload) => {
      const sess = client.sessionId;
      const sId = payload?.squadId;
      const isReady = !!payload?.ready;

      if (!sId || !this.squads.has(sId)) {
        client.send('error', { message: 'Invalid squad' });
        return;
      }

      const sq = this.squads.get(sId);
      if (!sq.members.has(sess)) {
        client.send('error', { message: 'You are not in this squad' });
        return;
      }

      // Leader is always ready — ignore toggle
      if (sq.leader === sess) {
        sq.ready.set(sess, true);
      } else {
        sq.ready.set(sess, isReady);
      }

      this._broadcastLobby();
    });

    // === START MATCH (SQUAD) ===
    this.onMessage('start_match', async (client, payload) => {
      const sess = client.sessionId;
      const sId = payload?.squadId;

      if (!sId || !this.squads.has(sId)) {
        client.send('error', { message: 'Invalid squad' });
        return;
      }

      const sq = this.squads.get(sId);

      // Only leader + all ready + not already starting
      if (sq.leader !== sess || this.pendingMatches?.has(sId)) {
        client.send('error', { message: 'Only leader can start once' });
        return;
      }
      if (sq.members.size < 1) {
        client.send('error', { message: 'Need at least 1 player' });
        return;
      }
      for (const m of sq.members) {
        if (!sq.ready.get(m)) {
          client.send('error', { message: 'All must be ready' });
          return;
        }
      }

      // Mark as pending to prevent double-start
      if (!this.pendingMatches) this.pendingMatches = new Map();
      this.pendingMatches.set(sId, {});

      try {
        // Extract addresses for onJoin validation
        const allowedAddresses = Array.from(sq.members)
          .map(sid => this.players[sid]?.address)
          .filter(Boolean)
          .map(a => a.toLowerCase());

        // Create LOCKED room (no one else can join)
        const maxClients = sq.members.size >= 3 ? 3 : sq.members.size;
        const room = await matchMaker.createRoom('borc_room', {
          locked: true,
          maxClients,
          allowedAddresses,
        });

        // Wait a moment for room to be fully registered (Render cold start safety)
        await new Promise(r => setTimeout(r, 800));

        // Reserve a seat for EACH player (atomic, guaranteed)
        const reservations = new Map();
        for (const sid of sq.members) {
          const addr = this.players[sid]?.address?.toLowerCase() || null;
          const reservation = await matchMaker.reserveSeatFor(room, {
            playerId: addr,
            // Optional: pass extra data
          });
          reservations.set(sid, reservation);
        }

        // Send unique reservation to each client
        for (const sid of sq.members) {
          const targetClient = Array.from(this.clients).find(c => c.sessionId === sid);
          if (targetClient) {
            targetClient.send('game_ready', {
              reservation: reservations.get(sid),
              squadId: sId,
            });
          }
        }

        // Clean up squad after successful start
        this.squads.delete(sId);
        this.pendingMatches.delete(sId);

        // Auto-cleanup pending if not joined (e.g., 30s)
        setTimeout(() => this.pendingMatches.delete(sId), 30000);

        this._broadcastLobby();
      } catch (e) {
        console.error('[Lobby] start_match failed:', e);
        client.send('error', { message: 'Failed to start game', detail: e.message });
        this.pendingMatches.delete(sId);
      }
    });

    // MATCHMAKING QUEUE 
    this.onMessage('start_matchmaking', (client) => {
      const sess = client.sessionId;
      this.matchmakingQueue = this.matchmakingQueue.filter(q => q.sessionId !== sess);
      this.matchmakingQueue.push({ sessionId: sess, ts: Date.now() });
      client.send('matchmaking_status', { status: 'searching', timeout: MATCH_TIMEOUT_MS / 1000 });
      this._broadcastLobby();
    });

    this.onMessage('stop_matchmaking', (client) => {
      const sess = client.sessionId;
      this.matchmakingQueue = this.matchmakingQueue.filter(q => q.sessionId !== sess);
      client.send('matchmaking_status', { status: 'stopped' });
      this._broadcastLobby();
    });
  }

  onJoin(client, options) {
    // Guest placeholder until register
    this.players[client.sessionId] = {
      address: null,
      displayName: 'Guest',
      inSquad: false,
      squadId: null
    };
    this._broadcastLobby();
  }

  onLeave(client) {
    const sess = client.sessionId;
    const info = this.players[sess];

    if (info?.address) this.addressIndex.delete(info.address);
    delete this.players[sess];

    // Remove from squads
    for (const [sId, sq] of this.squads.entries()) {
      if (sq.members.has(sess)) {
        sq.members.delete(sess);
        sq.ready.delete(sess);
        if (sq.leader === sess) {
          const next = sq.members.values().next().value;
          sq.leader = next || null;
          if (next) sq.ready.set(next, true);
        }
        if (sq.members.size === 0) this.squads.delete(sId);
      }
    }

    // Clean pending if in squad
    if (info?.squadId) this.pendingMatches?.delete(info.squadId);

    // Remove from queue
    this.matchmakingQueue = this.matchmakingQueue.filter(q => q.sessionId !== sess);
    this._broadcastLobby();
  }

  onDispose() {
    clearInterval(this.matchmakingInterval);
  }

  // === MATCHMAKING PROCESSOR ===
  async _processMatchQueue() {
    const now = Date.now();
    const valid = [];

    for (const q of this.matchmakingQueue) {
      if (now - q.ts > MATCH_TIMEOUT_MS) {
        const client = this.clients.find(c => c.sessionId === q.sessionId);
        if (client) client.send('matchmaking_status', { status: 'timeout' });
      } else {
        valid.push(q);
      }
    }
    this.matchmakingQueue = valid;

    while (this.matchmakingQueue.length >= 2) {
      const a = this.matchmakingQueue.shift();
      const b = this.matchmakingQueue.shift();

      const sId = this._createSquad();
      const sq = this.squads.get(sId);
      sq.leader = a.sessionId;
      sq.members.add(a.sessionId);
      sq.members.add(b.sessionId);
      sq.ready.set(a.sessionId, true);
      sq.ready.set(b.sessionId, true);

      this._setPlayerSquad(a.sessionId, sId);
      this._setPlayerSquad(b.sessionId, sId);

      try {
        const addresses = [this.players[a.sessionId]?.address, this.players[b.sessionId]?.address].filter(Boolean);
        const roomInfo = await matchMaker.createRoom('borc_room', { allowedAddresses: addresses });
        const roomId = roomInfo?.roomId || roomInfo?.id;

        await new Promise(r => setTimeout(r, 120));

        for (const sid of [a.sessionId, b.sessionId]) {
          const target = this.clients.find(c => c.sessionId === sid);
          if (target) target.send('game_ready', { roomId });
        }
      } catch (e) {
        console.error('[Lobby] matchmaking createRoom failed:', e);
        for (const sid of [a.sessionId, b.sessionId]) {
          const target = this.clients.find(c => c.sessionId === sid);
          if (target) target.send('error', { message: 'Matchmaking failed' });
        }
      }
    }

    // Solo fallback for remaining single in queue
    if (this.matchmakingQueue.length === 1) {
      const solo = this.matchmakingQueue.shift();
      if (now - solo.ts > MATCH_TIMEOUT_MS / 2) {  // Half timeout for solo
        // Create solo squad and room
        const sId = this._createSquad();
        const sq = this.squads.get(sId);
        sq.leader = solo.sessionId;
        sq.members.add(solo.sessionId);
        sq.ready.set(solo.sessionId, true);

        this._setPlayerSquad(solo.sessionId, sId);

        const addresses = [this.players[solo.sessionId]?.address].filter(Boolean);
        try {
          const roomInfo = await matchMaker.createRoom('borc_room', { 
            allowedAddresses: addresses,
            maxClients: 1,  // Solo lock
            locked: true
          });
          const roomId = roomInfo?.roomId || roomInfo?.id;
          await new Promise(r => setTimeout(r, 120));
          const target = this.clients.find(c => c.sessionId === solo.sessionId);
          if (target) target.send('game_ready', { roomId });
        } catch (e) {
          console.error('[Lobby] solo matchmaking createRoom failed:', e);
          const target = this.clients.find(c => c.sessionId === solo.sessionId);
          if (target) target.send('error', { message: 'Solo matchmaking failed' });
        }
      } else {
        // Re-add if not timed out
        this.matchmakingQueue.push(solo);
      }
    }

    this._broadcastLobby();
  }

  // === HELPERS ===
  _broadcastLobby() {
    const playersList = Object.entries(this.players).map(([sessionId, p]) => ({
      sessionId,
      address: p.address,
      displayName: p.displayName,
      baseName: p.baseName,  
      inSquad: p.inSquad,
      squadId: p.squadId
    }));

    const squadsList = Array.from(this.squads.entries()).map(([squadId, sq]) => ({
      squadId,
      leader: sq.leader,
      members: Array.from(sq.members),
      ready: Array.from(sq.ready.entries())
    }));

    this.broadcast('lobby_update', {
      players: playersList,
      squads: squadsList,
      queueSize: this.matchmakingQueue.length
    });
  }

  _createSquad() {
    const id = 's_' + randomBytes(4).toString('hex');
    this.squads.set(id, {
      leader: null,
      members: new Set(),
      ready: new Map()
    });
    return id;
  }

  _ensureSquadForLeader(leaderId) {
    for (const [sid, sq] of this.squads.entries()) {
      if (sq.members.has(leaderId)) return sid;
    }
    const sId = this._createSquad();
    const sq = this.squads.get(sId);
    sq.leader = leaderId;
    sq.members.add(leaderId);
    sq.ready.set(leaderId, true); // Leader auto-ready
    this._setPlayerSquad(leaderId, sId);
    return sId;
  }

  _setPlayerSquad(sessionId, squadId) {
    const p = this.players[sessionId];
    if (!p) return;
    p.inSquad = !!squadId;
    p.squadId = squadId;
    this.players[sessionId] = p;
  }

  _getAddr(sessionId) { return this.players[sessionId]?.address || null; }
  _getName(sessionId) {
    const p = this.players[sessionId];
    return p?.baseName || p?.displayName || 'Guest';
  }
  _shortAddress(addr) { return addr ? `${addr.slice(0,6)}…${addr.slice(-4)}` : 'Guest'; }
}