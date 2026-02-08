import { Client } from "colyseus.js";
import { walletService } from './WalletService.js';

export class NetworkService {
  constructor() {
    this.colyseusClient = new Client(import.meta.env.VITE_COLYSEUS_WS || 'ws://localhost:2567');
    this.gameRoom = null;
    this.gameState = null;
    this.sessionId = null;
    this.playerKey = null;
    this._inputSeq = 0;
    this._inputBuffer = [];
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
    this.sessionId = this.gameRoom.sessionId;
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
