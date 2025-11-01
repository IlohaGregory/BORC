import { Client } from "colyseus.js";
import { walletService } from './WalletService.js';
import { profileService } from './ProfileService.js';

export class NetworkService {
  constructor() {
    this.colyseusClient = new Client(import.meta.env.VITE_COLYSEUS_WS || 'ws://localhost:2567');
    this.lobbyRoom = null;
    this.gameRoom = null;
    this.lobbyState = null;
    this.gameState = null;
    this.sessionId = null;
    this.playerKey = null;
    this._lastLobbyError = null;
    this._lastInvite = null;
    this._lastMatchmaking = null;
    this._lastGameReady = null;
    this._inputSeq = 0;
    this._inputBuffer = []; // For offline buffering

    // callbacks UI can set
    this.onInvite = null;
    this.onGameReady = null;
    this.onGameReadyError = null;
  }

  get room() { return this.gameRoom; }
  get state() { return this.gameState; }

  // ---------------- Lobby ----------------
  async connectToLobby() {
    this.lobbyRoom = await this.colyseusClient.joinOrCreate('borc_lobby');
    this.sessionId = this.lobbyRoom.sessionId;

    this.lobbyRoom.onMessage('lobby_update', (data) => {
      this.lobbyState = data;
      console.debug('[Network] lobby_update', data);
    });

    this.lobbyRoom.onMessage('invite', (data) => {
      console.debug('[Network] invite received', data);
      this._lastInvite = data;
      if (this.onInvite) try { this.onInvite(data); } catch (_) {}
    });

    // When server signals a created game room for us:
    this.lobbyRoom.onMessage('game_ready', async (data) => {
      console.debug('[Network] game_ready', data);
      this._lastGameReady = data;

      try {
        await this.joinGameWithReservation(data.reservation);
        if (this.onGameReady) this.onGameReady(data);
      } catch (err) {
        if (this.onGameReadyError) this.onGameReadyError(err);
      }
    });

    this.lobbyRoom.onMessage('matchmaking_status', (m) => {
      this._lastMatchmaking = m;
      console.debug('[Network] matchmaking_status', m);
    });

    this.lobbyRoom.onMessage('error', (payload) => {
      this._lastLobbyError = payload?.message || JSON.stringify(payload);
      console.warn('[Network] lobby error', payload);
    });

    // Auto-reconnect on error
    this.lobbyRoom.onError((code, message) => {
      console.warn('[Network] Lobby error, retrying...', { code, message });
      setTimeout(() => this.connectToLobby(), 5000);
    });

    // Load display name and baseName from profileService (localStorage)
    const profile = profileService.load() || {};
    let displayName = profile.displayName;

    // Fallbacks for displayName
    if (!displayName && walletService?.getDisplayName) {
      displayName = walletService.getDisplayName();
    }
    if (!displayName && address) {
      displayName = `${address.slice(0,6)}…${address.slice(-4)}`;
    }
    displayName = displayName || 'Guest';

    // Load or fallback-fetch baseName
    let baseName = profile.baseName;
    const address = walletService?.getAddress?.() || null;
    if (!baseName && walletService?.address) {
      baseName = await walletService.resolveBaseName().catch(() => null);
    }

    try {
      await this.registerLobby(address?.toLowerCase(), displayName, baseName);
    } catch (e) {
      console.warn('[Network] registerLobby failed', e);
    }

    console.info('[Network] joined lobby', { roomId: this.lobbyRoom.roomId, sessionId: this.sessionId });
    return this.lobbyRoom;
  }

  async registerLobby(address, displayName, baseName) {
    if (!this.lobbyRoom) throw new Error('not-in-lobby');
    try {
      this.lobbyRoom.send('register', { address, displayName, baseName });
    } catch (e) {
      throw e;
    }
  }

  async sendInvite({ toSessionId = null, toAddress = null } = {}) {
    if (!this.lobbyRoom) throw new Error('not-in-lobby');
    try {
      this.lobbyRoom.send('invite', { toSessionId, toAddress });
    } catch (e) {
      console.warn('[Network] sendInvite failed', e);
      throw e;
    }
  }

  async joinSquad(squadId, leaderId) {
    if (!this.lobbyRoom) throw new Error('not-in-lobby');
    this.lobbyRoom.send('join_squad', { squadId, leaderId });
  }

  async leaveSquad(squadId) {
    if (!this.lobbyRoom) throw new Error('not-in-lobby');
    this.lobbyRoom.send('leave_squad', { squadId });
  }

  async setReady(squadId, ready) {
    if (!this.lobbyRoom) throw new Error('not-in-lobby');
    this.lobbyRoom.send('set_ready', { squadId, ready });
  }

  async startMatchAsLeader(squadId) {
    if (!this.lobbyRoom) throw new Error('not-in-lobby');
    this.lobbyRoom.send('start_match', { squadId });
  }

  async startMatchmaking() {
    if (!this.lobbyRoom) throw new Error('not-in-lobby');
    this.lobbyRoom.send('start_matchmaking', {});
  }

  async stopMatchmaking() {
    if (!this.lobbyRoom) throw new Error('not-in-lobby');
    this.lobbyRoom.send('stop_matchmaking', {});
  }

  // ---------------- Game room join ----------------
  async joinGameWithReservation(reservation) {
    if (this.gameRoom) return this.gameRoom;

    // Leave lobby
    if (this.lobbyRoom) {
      await this.leaveLobby();
      this.lobbyRoom = null;
    }

    const addr = walletService?.getAddress?.()?.toLowerCase();
    const skipAuth = import.meta.env.VITE_SKIP_GAME_AUTH === 'true';

    try {
      if (skipAuth) {
        this.gameRoom = await this.colyseusClient.consumeSeatReservation(reservation);
      } else {
        // Get nonce
        const base = import.meta.env.VITE_LOBBY_HTTP || 'http://localhost:2567';
        const r = await fetch(`${base}/nonce/${addr}`);
        if (!r.ok) throw new Error('nonce failed');
        const { nonce } = await r.json();

        // Sign
        const signature = await walletService.provider.request({
          method: 'personal_sign',
          params: [nonce, addr]
        });

        // Attach auth to reservation
        reservation.options = {
          ...(reservation.options || {}),
          address: addr,
          signature,
          nonce,
        };

        this.gameRoom = await this.colyseusClient.consumeSeatReservation(reservation);
      }

      this.sessionId = this.gameRoom.sessionId;
      this.playerKey = addr;
      this._attachGameRoomHandlers();

      // Resend buffered inputs on connect
      this._inputBuffer.forEach(input => this.gameRoom.send('input', input));
      this._inputBuffer = [];

      return this.gameRoom;
    } catch (err) {
      console.error('Reservation join failed:', err);
      throw err;
    }
  }

  _attachGameRoomHandlers() {
    if (!this.gameRoom) return;
    this.gameRoom.onStateChange((s) => { this.gameState = s; });
    this.gameRoom.onMessage('player_dead', (m) => { this._lastPlayerDead = m; });
    this.gameRoom.onMessage('gameover', (m) => { this._lastGameOver = m; });
    this.sessionId = this.gameRoom.sessionId;
    console.info('[Network] joined game room', { roomId: this.gameRoom.roomId, sessionId: this.sessionId, playerKey: this.playerKey });
  }

  async joinRoom(roomId = null) {
    if (roomId) return this.joinGameRoomById(roomId);
    if (this.gameRoom) return this.gameRoom;

    if (this._lastGameReady?.roomId) return this.joinGameRoomById(this._lastGameReady.roomId);
    throw new Error('no-room-to-join');
  }

  sendInput(input) {
    try {
      if (!this.gameRoom) {
        console.warn('[Network] sendInput buffered — not in game room');
        this._inputBuffer.push(input); // Buffer for reconnect
        return;
      }
      input.seq = (this._inputSeq = (this._inputSeq || 0) + 1);

      // ensure lowercase playerKey is always attached
      if (!input.playerKey && this.playerKey) {
        input.playerKey = this.playerKey.toLowerCase();
      }
      console.debug('[Network] sending input', input);

      this.gameRoom.send('input', input);

    } catch (e) {
      console.error('[Network] sendInput error', e);
    }
  }

  async leaveLobby() {
     if (this.lobbyRoom) {
      try {
        await this.lobbyRoom.leave();
      } catch (e) {
        console.warn('[Network] leaveLobby error', e);
      } finally {
        this.lobbyRoom = null;
        this.lobbyState = null;
      }
    }
  }

  async leaveGame() {
    if (this.gameRoom) {
      try {
        await this.gameRoom.leave();
      } catch (e) {
        console.warn('[Network] leaveGame error', e);
      } finally {
        this.gameRoom = null;
        this.gameState = null;
      }
    }
  }
}

export const networkService = new NetworkService();