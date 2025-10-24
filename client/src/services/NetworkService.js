import { Client } from "colyseus.js";
import { walletService } from './WalletService.js';

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

    // callbacks UI can set
    this.onInvite = null;
    this.onGameReady = null;
    this.onGameReadyError = null;
  }

  get room() { return this.gameRoom; }
  get state() { return this.gameState; }

  // ---------------- Lobby ----------------
  async connectToLobby() {
    // join or create the shared lobby
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
    this.lobbyRoom.onMessage('game_ready', (data) => {
      console.debug('[Network] game_ready', data);
      this._lastGameReady = data;
      // auto-join the game room (non-blocking). data may include playerKey
      this.joinGameRoomById(data.roomId)
        .then(room => {
          console.info('[Network] joined game room', data.roomId);
          if (this.onGameReady) try { this.onGameReady(data); } catch (_) {}
        })
        .catch(err => {
          console.error('[Network] failed to join game room', err);
          if (this.onGameReadyError) try { this.onGameReadyError(err); } catch (_) {}
        });
    });

    this.lobbyRoom.onMessage('matchmaking_status', (m) => {
      this._lastMatchmaking = m;
      console.debug('[Network] matchmaking_status', m);
    });

    this.lobbyRoom.onMessage('error', (payload) => {
      this._lastLobbyError = payload?.message || JSON.stringify(payload);
      console.warn('[Network] lobby error', payload);
    });

    // register our profile with the lobby (do not block if wallet missing — send null)
    const address = (walletService && walletService.getAddress) ? walletService.getAddress() : null;
    const displayName = (walletService && walletService.getDisplayName)
      ? (walletService.getDisplayName() || (address ? `${address.slice(0,6)}…${address.slice(-4)}` : 'Guest'))
      : (address ? `${address.slice(0,6)}…${address.slice(-4)}` : 'Guest');

    try {
      await this.registerLobby(address, displayName);
    } catch (e) {
      console.warn('[Network] registerLobby failed', e);
      // still continue — lobby join itself succeeded
    }

    console.info('[Network] joined lobby', { roomId: this.lobbyRoom.roomId, sessionId: this.sessionId });
    return this.lobbyRoom;
  }

  async registerLobby(address, displayName) {
    if (!this.lobbyRoom) throw new Error('not-in-lobby');
    try {
      // colyseus Room.send is synchronous; use try/catch for safety
      this.lobbyRoom.send('register', { address: address ? address.toLowerCase() : null, displayName });
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
  async joinGameRoomById(roomId) {
    if (this.gameRoom && this.gameRoom.roomId === roomId) {
      console.debug('[Network] already in game room', roomId);
      return this.gameRoom;
    }

    // default: dev-friendly skipAuth unless explicitly set to "false"
    const skipAuth = (import.meta.env.VITE_SKIP_GAME_AUTH === 'false') ? false : true;

    // ensure we leave lobby first to avoid duplicate sessions
    if (this.lobbyRoom) {
      try { await this.leaveLobby(); } catch (e) { console.warn('[Network] leaveLobby failed', e); }
      this.lobbyRoom = null;
    }

    // prepare stable playerId (wallet address preferred)
    const addrRaw = (typeof walletService !== 'undefined' && walletService.getAddress) ? walletService.getAddress() : null;
    const addr = addrRaw ? addrRaw.toLowerCase() : null;
    const playerId = addr || null;

    if (skipAuth) {
      this.gameRoom = await this.colyseusClient.joinById(roomId, { playerId });
      this.sessionId = this.gameRoom.sessionId;

      // ensure consistent lowercase player key
      this.playerKey = (playerId || this.sessionId);
      if (this.playerKey && typeof this.playerKey === 'string') {
        this.playerKey = this.playerKey.toLowerCase();
      }

      this._attachGameRoomHandlers();
      return this.gameRoom;

    }

    // production path: fetch nonce and sign
    const address = addr ? addr.toLowerCase() : this.sessionId;
    if (!address) throw new Error('wallet-not-connected');

    const base = import.meta.env.VITE_LOBBY_HTTP || 'http://localhost:2567';
    const r = await fetch(`${base}/nonce/${address}`);
    if (!r.ok) throw new Error('nonce-failed');
    const { nonce } = await r.json();

    const signature = await walletService.provider.request({
      method: 'personal_sign',
      params: [nonce, address]
    });

    // join with retry/backoff
    const maxAttempts = 7;
    let attempt = 0;
    while (attempt < maxAttempts) {
      try {
        this.gameRoom = await this.colyseusClient.joinById(roomId, { 
          playerId: address, 
          address, 
          signature, 
          nonce 
        });
        this.sessionId = this.gameRoom.sessionId;

        // ensure consistent lowercase player key
        this.playerKey = (playerId || this.sessionId);
        if (this.playerKey && typeof this.playerKey === 'string') {
          this.playerKey = this.playerKey.toLowerCase();
        }
        this._attachGameRoomHandlers();
        return this.gameRoom;

      } catch (e) {
        attempt++;
        const isNotFound = e?.name === 'MatchMakeError' && /not found/i.test(e.message);
        if (isNotFound && attempt < maxAttempts) {
          await new Promise(r => setTimeout(r, 150 * attempt));
          continue;
        }
        throw e;
      }
    }
    throw new Error('join-failed-after-retries');
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
        console.warn('[Network] sendInput skipped — not in game room');
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
