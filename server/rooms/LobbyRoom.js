import { Room } from 'colyseus';
import { randomBytes } from 'crypto';
import { matchMaker } from '@colyseus/core';


const MATCH_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const MATCH_CHECK_INTERVAL_MS = 1000;

export class LobbyRoom extends Room {
  onCreate(options) {
    this.players = {};         // sessionId => player info
    this.squads = new Map();   // squadId => { leader, members:Set, ready:Map }
    this.addressIndex = new Map(); // address => sessionId
    this.matchmakingQueue = []; // array of { sessionId, ts }

    // periodic matchmaking processing
    this.matchmakingInterval = setInterval(() => this._processMatchQueue(), MATCH_CHECK_INTERVAL_MS);

    // register a player in lobby (address optional)
    this.onMessage('register', (client, payload) => {
      const address = (payload.address || null);
      const displayName = payload.displayName || this._shortAddress(address);
      this.players[client.sessionId] = { address, displayName, inSquad: false, squadId: null };
      if (address) this.addressIndex.set(address.toLowerCase(), client.sessionId);
      this._broadcastLobby();
    });

    // invite by sessionId or address
    this.onMessage('invite', (client, payload) => {
      const toSessionId = payload?.toSessionId;
      const toAddress = (payload?.toAddress || null);
      let targetSession = null;

      if (toSessionId) targetSession = toSessionId;
      else if (toAddress) targetSession = this.addressIndex.get(toAddress.toLowerCase());

      console.log('[Lobby][invite] from', client.sessionId, 'toSession', targetSession, 'toAddress', toAddress);

      if (!targetSession) {
        client.send('error', { message: 'Player not online or not registered' });
        return;
      }
     // after computing targetSession
      const targetClient = this.clients.find(c => c.sessionId === targetSession);
      if (targetClient) {
        targetClient.send('invite', { fromSession: client.sessionId, fromAddress: this._getAddr(client.sessionId), fromName: this._getName(client.sessionId) });
      } else {
        // fallback: broadcast a 'direct_invite' with intended sessionId so the client receives it if in same room instance
        console.warn('[Lobby][invite] targetClient not found by sessionId, broadcasting direct_invite fallback', targetSession);
        this.broadcast('direct_invite', { toSessionId: targetSession, fromSession: client.sessionId, fromName: this._getName(client.sessionId) });
      }
    });

    // join squad (by squadId or leaderId); creates squad if needed
    this.onMessage('join_squad', (client, payload) => {
      const sess = client.sessionId;
      let squadId = payload?.squadId;
      if (!squadId && payload?.leaderId) squadId = this._ensureSquadForLeader(payload.leaderId);
      if (!squadId) squadId = this._createSquad();

      const squad = this.squads.get(squadId);
      if (squad.members.size >= 3) { client.send('error', { message: 'Squad full' }); return; }
      squad.members.add(sess);
      squad.ready.set(sess, false);
      this._setPlayerSquad(sess, squadId);
      this._broadcastLobby();
    });

    this.onMessage('leave_squad', (client, payload) => {
      const sess = client.sessionId;
      const sId = payload?.squadId;
      if (sId && this.squads.has(sId)) {
        const sq = this.squads.get(sId);
        sq.members.delete(sess);
        sq.ready.delete(sess);
        if (sq.leader === sess) {
          const next = sq.members.values().next().value;
          if (next) sq.leader = next; else this.squads.delete(sId);
        }
      } else {
        for (const [sid, sq] of this.squads.entries()) {
          if (sq.members.has(sess)) {
            sq.members.delete(sess);
            sq.ready.delete(sess);
            if (sq.leader === sess) {
              const next = sq.members.values().next().value;
              if (next) sq.leader = next; else this.squads.delete(sid);
            }
            break;
          }
        }
      }
      this._setPlayerSquad(sess, null);
      this._broadcastLobby();
    });

    // ready/unready toggle
    this.onMessage('set_ready', (client, payload) => {
      const sess = client.sessionId;
      const sId = payload?.squadId;
      const isReady = !!payload?.ready;
      if (!sId || !this.squads.has(sId)) { client.send('error', { message: 'Invalid squad' }); return; }
      const sq = this.squads.get(sId);
      if (!sq.members.has(sess)) { client.send('error', { message: 'Not in squad' }); return; }
      sq.ready.set(sess, isReady);
      this._broadcastLobby();
    });

    this.onMessage('start_match', async (client, payload) => {
      // Leader requested to start the match for a squad
      console.log('[Lobby][start_match] received from', client.sessionId, 'payload', payload);
      const sess = client.sessionId;
      const sId = payload?.squadId;

      if (!sId || !this.squads.has(sId)) {
        console.log('[Lobby][start_match] invalid squad -> sending error');
        client.send('error', { message: 'Invalid squad' });
        return;
      }

      const sq = this.squads.get(sId);
      console.log('[Lobby][start_match] squadId', sId, 'squads.has?', true);
      console.log('[Lobby][start_match] squad info', {
        leader: sq.leader,
        members: Array.from(sq.members),
        ready: Array.from(sq.ready.entries())
      });

      // only leader may start
      if (sq.leader !== sess) {
        console.log('[Lobby][start_match] rejecting - caller not leader', sess, 'leader is', sq.leader);
        client.send('error', { message: 'Only leader can start' });
        return;
      }

      // require at least 2 players
      if (sq.members.size < 2) {
        console.log('[Lobby][start_match] rejecting - not enough players', sq.members.size);
        client.send('error', { message: 'Need at least 2 players' });
        return;
      }

      // ensure all members are ready
      for (const m of sq.members) {
        if (!sq.ready.get(m)) {
          console.log('[Lobby][start_match] rejecting - member not ready', m);
          client.send('error', { message: 'All members must be ready' });
          return;
        }
      }

      try {
        console.log('[Lobby][start_match] all checks passed, creating room for squad', sId);

        // Collect wallet addresses (may be null) to pass as options
        const players = Array.from(sq.members).map(sid => (this.players[sid]?.address || null)).filter(Boolean);
        const roomInfo = await matchMaker.createRoom('borc_room', { allowedAddresses: players });

        console.log('[Lobby][start_match] matchMaker.createRoom returned', roomInfo);

        // matchMaker.createRoom returns RoomData: extract roomId robustly
        const roomId =
          (roomInfo && (roomInfo.roomId || roomInfo.room?.roomId || roomInfo.id || roomInfo.room?.id)) ||
          roomInfo?.roomId || roomInfo?.id;

        if (!roomId) {
          throw new Error('no-room-id-returned');
        }

        console.log('[Lobby][start_match] created roomId', roomId);

        // small delay to allow the new room to be ready for immediate joins
        await new Promise(r => setTimeout(r, 120));

        // Notify each squad member directly; prefer finding client instance and sending
        for (const sid of sq.members) {
          const target = this.clients.find(c => c.sessionId === sid);
          const payloadOut = { roomId, squadId: sId, leader: sq.leader, playerKey: this.players[sid]?.address || null };
          if (target && typeof target.send === 'function') {
            target.send('game_ready', payloadOut);
          } else {
            // fallback: broadcast to room with a filter (Colyseus supports third arg -> options)
            try {
              // the simple fallback is to broadcast and let client filter by session (rare)
              this.send(sid, 'game_ready', payloadOut);
            } catch (e) {
              // last resort: broadcast to all (shouldn't happen often)
              this.broadcast('game_ready', payloadOut);
            }
          }
        }

        // remove squad from lobby now that match started (so UI updates)
        this.squads.delete(sId);
        for (const sid of sq.members) {
          if (this.players[sid]) {
            this.players[sid].inSquad = false;
            this.players[sid].squadId = null;
          }
        }
        this._broadcastLobby();
      } catch (e) {
        console.error('[Lobby][start_match] createRoom failed', e);
        client.send('error', { message: 'Failed to create game room', detail: e?.message || null });
      }
    });


    // matchmaking queue join/leave
    this.onMessage('start_matchmaking', (client, payload) => {
      const sess = client.sessionId;
      // ensure not already queued
      this.matchmakingQueue = this.matchmakingQueue.filter(q => q.sessionId !== sess);
      this.matchmakingQueue.push({ sessionId: sess, ts: Date.now() });
      client.send('matchmaking_status', { status: 'searching', timeout: MATCH_TIMEOUT_MS / 1000 });
      this._broadcastLobby();
    });

    this.onMessage('stop_matchmaking', (client, payload) => {
      const sess = client.sessionId;
      this.matchmakingQueue = this.matchmakingQueue.filter(q => q.sessionId !== sess);
      client.send('matchmaking_status', { status: 'stopped' });
      this._broadcastLobby();
    });
  }

  onJoin(client, options) {
    // register a guest entry to ensure invites by sessionId work
    this.players[client.sessionId] = { address: null, displayName: 'Guest', inSquad: false, squadId: null };
    this._broadcastLobby();
  }

  onLeave(client) {
    const sess = client.sessionId;
    const info = this.players[sess] || {};
    if (info.address) this.addressIndex.delete(info.address.toLowerCase());
    delete this.players[sess];

    // remove from squads
    for (const [sId, sq] of this.squads.entries()) {
      if (sq.members.has(sess)) {
        sq.members.delete(sess);
        sq.ready.delete(sess);
        if (sq.leader === sess) {
          const next = sq.members.values().next().value;
          if (next) sq.leader = next; else this.squads.delete(sId);
        }
      }
    }

    // remove from matchmaking queue
    this.matchmakingQueue = this.matchmakingQueue.filter(q => q.sessionId !== sess);
    this._broadcastLobby();
  }

  onDispose() {
    clearInterval(this.matchmakingInterval);
    this.players = {};
    this.squads.clear();
    this.addressIndex.clear();
    this.matchmakingQueue = [];
  }

  // matchmaking routine: pair FIFO in pairs, create squads & rooms
  async _processMatchQueue() {
    const now = Date.now();
    // timeouts
    const remaining = [];
    for (const q of this.matchmakingQueue) {
      if (now - q.ts > MATCH_TIMEOUT_MS) {
        const client = this.clients.find(c => c.sessionId === q.sessionId);
        if (client) client.send('matchmaking_status', { status: 'timeout' });
      } else remaining.push(q);
    }
    this.matchmakingQueue = remaining;

    // pair in FIFO pairs
    while (this.matchmakingQueue.length >= 2) {
      const a = this.matchmakingQueue.shift();
      const b = this.matchmakingQueue.shift();
      const sId = this._createSquad();
      const sq = this.squads.get(sId);
      sq.members.add(a.sessionId);
      sq.members.add(b.sessionId);
      sq.leader = Math.random() < 0.5 ? a.sessionId : b.sessionId;
      sq.ready.set(a.sessionId, true);
      sq.ready.set(b.sessionId, true);
      this._setPlayerSquad(a.sessionId, sId);
      this._setPlayerSquad(b.sessionId, sId);

      try {
        const players = [this.players[a.sessionId]?.address, this.players[b.sessionId]?.address].filter(Boolean);
        const roomInfo = await matchMaker.createRoom('borc_room', { allowedAddresses: players });
        const roomId = roomInfo?.roomId || roomInfo?.room?.roomId || roomInfo?.id || roomInfo?.room?.id;
        // small delay for transport readiness
        await new Promise(r => setTimeout(r, 120));
        for (const sid of sq.members) {
          const target = this.clients.find(c => c.sessionId === sid);
          if (target) target.send('game_ready', { roomId });
        }
      } catch (e) {
        console.error('[Lobby][_processMatchQueue] createRoom error', e);
        for (const sid of sq.members) {
          const target = this.clients.find(c => c.sessionId === sid);
          if (target) target.send('error', { message: 'Matchmaking failed' });
        }
      }
    }

    this._broadcastLobby();
  }

  // helpers
  _broadcastLobby() {
    const playersList = Object.entries(this.players).map(([sessionId, info]) => ({
      sessionId,
      address: info.address,
      displayName: info.displayName,
      inSquad: info.inSquad,
      squadId: info.squadId
    }));
    const squadsList = Array.from(this.squads.entries()).map(([squadId, sq]) => ({
      squadId,
      leader: sq.leader,
      members: Array.from(sq.members),
      ready: Array.from(sq.ready.entries()) // [[sessionId, bool], ...]
    }));
    this.broadcast('lobby_update', { players: playersList, squads: squadsList, queueSize: this.matchmakingQueue.length });
  }

  _createSquad() {
    const id = 's_' + randomBytes(4).toString('hex');
    this.squads.set(id, { leader: null, members: new Set(), ready: new Map() });
    return id;
  }

  _ensureSquadForLeader(leaderId) {
    for (const [sid, set] of this.squads.entries()) {
      if (set.members.has(leaderId)) return sid;
    }
    const s = this._createSquad();
    const sq = this.squads.get(s);
    sq.members.add(leaderId);
    sq.leader = leaderId;
    sq.ready.set(leaderId, false);
    this._setPlayerSquad(leaderId, s);
    return s;
  }

  _setPlayerSquad(sessionId, squadId) {
    const info = this.players[sessionId] || { address: null, displayName: 'Guest', inSquad: false, squadId: null };
    info.inSquad = !!squadId;
    info.squadId = squadId;
    this.players[sessionId] = info;
    if (info.address) this.addressIndex.set(info.address.toLowerCase(), sessionId);
  }

  _getAddr(sessionId) {
    return (this.players[sessionId] && this.players[sessionId].address) || null;
  }
  _getName(sessionId) {
    return (this.players[sessionId] && this.players[sessionId].displayName) || 'Guest';
  }
  _shortAddress(addr) {
    if (!addr) return 'Guest';
    return addr ? `${addr.slice(0,6)}…${addr.slice(-4)}` : 'Guest';
  }
}
