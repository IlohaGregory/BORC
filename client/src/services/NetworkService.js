import { Client } from "colyseus.js";
import { walletService } from './WalletService.js';

export class NetworkService {
  constructor() {
    const baseUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:2567';
    const wsUrl = baseUrl.replace(/^http/, 'ws');
    this.colyseusClient = new Client(wsUrl);
    this.gameRoom = null;
    this.gameState = null;
    this.sessionId = null;
    this.playerKey = null;
    this._inputSeq = 0;
    this._inputBuffer = [];
    this._reconnectAttempts = 0;
    this._maxReconnectAttempts = 5;
    this._setupMobileHandlers();
  }

  _setupMobileHandlers() {
    // Handle mobile app backgrounding
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && this.gameRoom) {
          // App resumed - check connection health
          this._checkConnectionHealth();
        }
      });
    }

    // Handle network state changes
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('online', () => {
        console.info('[Network] Connection restored');
        if (this.gameRoom) this._checkConnectionHealth();
      });
      window.addEventListener('offline', () => {
        console.warn('[Network] Connection lost');
      });
    }
  }

  _checkConnectionHealth() {
    if (!this.gameRoom || !this.gameRoom.connection) return;

    try {
      // Send ping to verify connection
      this.gameRoom.send('ping', { timestamp: Date.now() });
    } catch (err) {
      console.warn('[Network] Connection health check failed:', err);
      this._attemptReconnect();
    }
  }

  async _attemptReconnect() {
    if (this._reconnectAttempts >= this._maxReconnectAttempts) {
      console.error('[Network] Max reconnect attempts reached');
      return;
    }

    this._reconnectAttempts++;
    console.info(`[Network] Reconnect attempt ${this._reconnectAttempts}/${this._maxReconnectAttempts}`);

    // Exponential backoff
    const delay = Math.min(1000 * Math.pow(2, this._reconnectAttempts - 1), 10000);
    await new Promise(resolve => setTimeout(resolve, delay));

    // Trigger reconnection logic (game scene should handle this)
    if (this.gameRoom) {
      this.gameRoom.connection.close();
    }
  }

  get room() { return this.gameRoom; }
  get state() { return this.gameState; }

  // ---------------- Game room join ----------------
  async joinGameWithReservation(reservation) {
    if (this.gameRoom) return this.gameRoom;

    const addr = walletService?.getAddress?.()?.toLowerCase();
    const skipAuth = true; // Always skip signing for game joins

    try {
      if (skipAuth) {
        this.gameRoom = await this.colyseusClient.consumeSeatReservation(reservation);
      } else {
        // Get nonce
        const base = import.meta.env.VITE_SERVER_URL || 'http://localhost:2567';
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
      this.playerKey = addr || 'guest';
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
    this.gameRoom.onError((code, message) => {
      console.error('[Network] Room error:', code, message);
    });
    this.gameRoom.onLeave((code) => {
      console.warn('[Network] Left room:', code);
      if (code !== 1000) {
        // Abnormal disconnect
        this._attemptReconnect();
      }
    });
    this.sessionId = this.gameRoom.sessionId;
    this._reconnectAttempts = 0; // Reset on successful connection
    console.info('[Network] joined game room', { roomId: this.gameRoom.roomId, sessionId: this.sessionId, playerKey: this.playerKey });
  }

  async joinRoom(roomId = null) {
    if (this.gameRoom) return this.gameRoom;
    throw new Error('no-room-to-join');
  }

  sendInput(input) {
    try {
      if (!this.gameRoom) {
        this._inputBuffer.push(input);
        return;
      }
      input.seq = (this._inputSeq = (this._inputSeq || 0) + 1);

      if (!input.playerKey && this.playerKey) {
        input.playerKey = this.playerKey.toLowerCase();
      }

      this.gameRoom.send('input', input);
    } catch (e) {
      console.error('[Network] sendInput error', e);
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
