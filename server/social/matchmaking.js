import { squads } from './squads.js';
import { presence } from './presence.js';
import { _createMatchForSquad } from '../routes/match.js';

const MATCH_TIMEOUT_MS = 5 * 60 * 1000;
const CHECK_INTERVAL_MS = 1000;

class Matchmaking {
  constructor() {
    /** @type {Array<{address: string, ts: number}>} */
    this.queue = [];
    this._interval = null;
  }

  start() {
    this._interval = setInterval(() => this._process(), CHECK_INTERVAL_MS);
  }

  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }

  enqueue(address) {
    this.queue = this.queue.filter(q => q.address !== address);
    this.queue.push({ address, ts: Date.now() });
  }

  dequeue(address) {
    this.queue = this.queue.filter(q => q.address !== address);
  }

  async _process() {
    const now = Date.now();
    const valid = [];

    // Remove timed-out entries
    for (const q of this.queue) {
      if (now - q.ts > MATCH_TIMEOUT_MS) {
        presence.send(q.address, 'matchmaking_status', { status: 'timeout' });
      } else {
        valid.push(q);
      }
    }
    this.queue = valid;

    // Pair players
    while (this.queue.length >= 2) {
      const a = this.queue.shift();
      const b = this.queue.shift();

      try {
        // Create auto-squad
        const squad = squads.create(a.address);
        squads.join(squad.id, b.address);
        squads.setReady(squad.id, b.address, true);

        await _createMatchForSquad(squads.get(squad.id));
      } catch (e) {
        console.error('[Matchmaking] pair failed:', e);
        presence.send(a.address, 'game_ready_error', { message: 'Matchmaking failed' });
        presence.send(b.address, 'game_ready_error', { message: 'Matchmaking failed' });
      }
    }

    // Solo fallback: player waiting > half the timeout
    if (this.queue.length === 1) {
      const solo = this.queue[0];
      if (now - solo.ts > MATCH_TIMEOUT_MS / 2) {
        this.queue.shift();
        try {
          const squad = squads.create(solo.address);
          await _createMatchForSquad(squads.get(squad.id));
        } catch (e) {
          console.error('[Matchmaking] solo fallback failed:', e);
          presence.send(solo.address, 'game_ready_error', { message: 'Solo matchmaking failed' });
        }
      }
    }
  }
}

export const matchmaking = new Matchmaking();
