export default class NetSync {
  constructor(networkService, scene, opts = {}) {
    this.networkService = networkService;
    this.scene = scene;

    // interpolation delay: increase for smoother playback; you can lower if you want fresher
    this.INTERP_MS = opts.interpMs ?? 180; // default 180ms (tweakable)
    this.INPUT_HZ = opts.inputHz ?? 15;
    this.inputInterval = Math.round(1000 / this.INPUT_HZ);
    this._inputTimer = null;
    this._inputSeq = 0;

    this.snapshots = [];
    this.maxSnapshots = opts.maxSnapshots ?? 60;

    // modest local prediction by default so players feel immediate
    this.predStrength = (typeof opts.predStrength === 'number') ? opts.predStrength : 0.45;

    this._onState = null;
  }

  async start() {
    this._onState = (s) => {
      const snap = { t: Date.now(), tick: s.tick || 0, players: {}, enemies: {}, bullets: {} };
      // Players
      if (s.players && typeof s.players.toJSON === 'function') {
        const plainPlayers = s.players.toJSON();
        for (const id in plainPlayers) {
          const p = plainPlayers[id];
          snap.players[id] = { x: p.x, y: p.y, hp: p.hp, alive: p.alive, score: p.score, id };
        }
      } else {
        for (const [id, p] of Object.entries(s.players || {})) {
          snap.players[id] = { x: p.x, y: p.y, hp: p.hp, alive: p.alive, score: p.score, id };
        }
      }

      // Enemies
      if (s.enemies && typeof s.enemies.toJSON === 'function') {
        const plainEnemies = s.enemies.toJSON();
        for (const id in plainEnemies) {
          const e = plainEnemies[id];
          snap.enemies[id] = { x: e.x, y: e.y, hp: e.hp, alive: e.alive, id };
        }
      } else {
        for (const [id, e] of Object.entries(s.enemies || {})) {
          snap.enemies[id] = { x: e.x, y: e.y, hp: e.hp, alive: e.alive, id };
        }
      }

      // Bullets
      if (s.bullets && typeof s.bullets.toJSON === 'function') {
        const plainBullets = s.bullets.toJSON();
        for (const id in plainBullets) {
          const b = plainBullets[id];
          snap.bullets[id] = { x: b.x, y: b.y, vx: b.vx, vy: b.vy, owner: b.owner, id };
        }
      } else {
        for (const [id, b] of Object.entries(s.bullets || {})) {
          snap.bullets[id] = { x: b.x, y: b.y, vx: b.vx, vy: b.vy, owner: b.owner, id };
        }
      }

      this.snapshots.push(snap);
      if (this.snapshots.length > this.maxSnapshots) this.snapshots.shift();

      if (Math.random() < 0.03) {
        console.debug('[NetSync] snapshot', { t: snap.t, tick: snap.tick, players: Object.keys(snap.players).length, ids: Object.keys(snap.players).slice(0,6) });
      }
    };

    if (this.networkService.gameRoom && this.networkService.gameRoom.onStateChange) {
      this.networkService.gameRoom.onStateChange(this._onState);
    } else {
      // fallback: poll for room until it's ready
      const roomCheck = setInterval(() => {
        if (this.networkService.gameRoom && this.networkService.gameRoom.onStateChange) {
          this.networkService.gameRoom.onStateChange(this._onState);
          clearInterval(roomCheck);
        }
      }, 100);
    }

    this._startInputLoop();
  }

  stop() {
    try { this.networkService.gameRoom?.removeListener?.('state', this._onState); } catch (e) {}
    if (this._inputTimer) { clearInterval(this._inputTimer); this._inputTimer = null; }
    this.snapshots = [];
  }

  _startInputLoop() {
    if (this._inputTimer) return;
    this._inputTimer = setInterval(() => this._sendInputSnapshot(), this.inputInterval);
  }

  _sendInputSnapshot() {
    const reg = this.scene.registry.get('input') || null;
    let up = 0, down = 0, left = 0, right = 0, aimAngle = null;
    if (reg) {
      up = reg.vector?.y < -0.5 ? 1 : 0;
      down = reg.vector?.y > 0.5 ? 1 : 0;
      left = reg.vector?.x < -0.5 ? 1 : 0;
      right = reg.vector?.x > 0.5 ? 1 : 0;
      if (reg.aim) aimAngle = Math.atan2(reg.aim.y - (this.scene.player?.y || 0), reg.aim.x - (this.scene.player?.x || 0));
    } else {
      const keys = this.scene.keys;
      if (keys) {
        left = keys.A?.isDown ? 1 : 0;
        right = keys.D?.isDown ? 1 : 0;
        up = keys.W?.isDown ? 1 : 0;
        down = keys.S?.isDown ? 1 : 0;
      }
    }

    const input = { seq: ++this._inputSeq, up: !!up, down: !!down, left: !!left, right: !!right, aimAngle };
    try {
      // prefer networkService.sendInput convenience method if available
      if (typeof this.networkService.sendInput === 'function') {
        this.networkService.sendInput(input);
      } else if (this.networkService.gameRoom && typeof this.networkService.gameRoom.send === 'function') {
        this.networkService.gameRoom.send('input', input);
      } else {
        console.warn('[NetSync] no networkService.sendInput or gameRoom.send available');
      }
      console.debug(`[NetSync] sendInput seq=${input.seq} up=${input.up} down=${input.down} left=${input.left} right=${input.right}`);

      // small local prediction nudge so movement is responsive:
      if (this.scene.player && this.predStrength > 0) {
        const speed = (this.scene.CFG?.player?.speed || 80);
        const dt = (this.inputInterval / 1000);
        this.scene.player.x += ((right - left) * speed) * dt * this.predStrength;
        this.scene.player.y += ((down - up) * speed) * dt * this.predStrength;
      }
    } catch (e) {
      console.debug('[NetSync] sendInput failed', e?.message || e);
    }
  }

  // interpolation helpers
  _findSnapshotsFor(renderTime) {
    if (this.snapshots.length < 2) return null;
    let i = this.snapshots.findIndex(s => s.t > renderTime);
    if (i <= 0) return null;
    return { older: this.snapshots[i - 1], newer: this.snapshots[i] };
  }

  _lerp(a, b, t) { return a + (b - a) * t; }

  renderInterpolated(callback) {
    const renderTime = Date.now() - this.INTERP_MS;
    const pair = this._findSnapshotsFor(renderTime);

    // fallback to latest snapshot if we can't interpolate
    if (!pair) {
      const latest = this.snapshots[this.snapshots.length - 1];
      if (!latest) return callback({ players: {}, enemies: {}, bullets: {}, snapshotMeta: { playersIds: [] } });
      const myKey = this.networkService.playerKey || this.networkService.sessionId;
      return callback({
        players: latest.players,
        enemies: latest.enemies,
        bullets: latest.bullets,
        snapshotMeta: { playersIds: Object.keys(latest.players) }
      });
    }

    const { older, newer } = pair;
    const denom = Math.max(1, (newer.t - older.t));
    let factor = (renderTime - older.t) / denom;
    factor = Math.max(0, Math.min(1, factor)); // clamp to [0,1]

    const safeNum = (v, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
    const unionKeys = (a = {}, b = {}) => {
      const set = new Set();
      Object.keys(a).forEach(k => set.add(k));
      Object.keys(b).forEach(k => set.add(k));
      return Array.from(set);
    };

    // players: use union of keys so removals/creates are handled
    const outPlayers = {};
    const playerIds = unionKeys(older.players, newer.players);
    for (const id of playerIds) {
      const oa = older.players[id];
      const nb = newer.players[id];

      if (!oa && nb) {
        outPlayers[id] = { x: safeNum(nb.x), y: safeNum(nb.y), hp: safeNum(nb.hp), alive: !!nb.alive, score: safeNum(nb.score) };
        continue;
      }
      if (!nb && oa) {
        outPlayers[id] = { x: safeNum(oa.x), y: safeNum(oa.y), hp: safeNum(oa.hp), alive: !!oa.alive, score: safeNum(oa.score) };
        continue;
      }
      // both exist: interpolate numeric fields
      const ix = this._lerp(safeNum(oa.x), safeNum(nb.x), factor);
      const iy = this._lerp(safeNum(oa.y), safeNum(nb.y), factor);
      const ihp = this._lerp(safeNum(oa.hp), safeNum(nb.hp), factor);
      outPlayers[id] = { x: ix, y: iy, hp: ihp, alive: !!nb.alive, score: safeNum(nb.score) };
    }

    // enemies
    const outEnemies = {};
    const enemyIds = unionKeys(older.enemies, newer.enemies);
    for (const id of enemyIds) {
      const oa = older.enemies[id];
      const nb = newer.enemies[id];
      if (!oa && nb) {
        outEnemies[id] = { x: safeNum(nb.x), y: safeNum(nb.y), hp: safeNum(nb.hp), alive: !!nb.alive };
        continue;
      }
      if (!nb && oa) {
        outEnemies[id] = { x: safeNum(oa.x), y: safeNum(oa.y), hp: safeNum(oa.hp), alive: !!oa.alive };
        continue;
      }
      const ix = this._lerp(safeNum(oa.x), safeNum(nb.x), factor);
      const iy = this._lerp(safeNum(oa.y), safeNum(nb.y), factor);
      const ihp = this._lerp(safeNum(oa.hp), safeNum(nb.hp), factor);
      outEnemies[id] = { x: ix, y: iy, hp: ihp, alive: !!nb.alive };
    }

    // bullets
    const outBullets = {};
    const bulletIds = unionKeys(older.bullets, newer.bullets);
    for (const id of bulletIds) {
      const oa = older.bullets[id];
      const nb = newer.bullets[id];
      if (!oa && nb) {
        outBullets[id] = { x: safeNum(nb.x), y: safeNum(nb.y), vx: safeNum(nb.vx), vy: safeNum(nb.vy), owner: nb.owner };
        continue;
      }
      if (!nb && oa) {
        outBullets[id] = { x: safeNum(oa.x), y: safeNum(oa.y), vx: safeNum(oa.vx), vy: safeNum(oa.vy), owner: oa.owner };
        continue;
      }
      const ix = this._lerp(safeNum(oa.x), safeNum(nb.x), factor);
      const iy = this._lerp(safeNum(oa.y), safeNum(nb.y), factor);
      const ivx = this._lerp(safeNum(oa.vx), safeNum(nb.vx), factor);
      const ivy = this._lerp(safeNum(oa.vy), safeNum(nb.vy), factor);
      outBullets[id] = { x: ix, y: iy, vx: ivx, vy: ivy, owner: nb.owner };
    }

    const myKey = this.networkService.playerKey || this.networkService.sessionId;

    callback({
      players: outPlayers,
      enemies: outEnemies,
      bullets: outBullets,
      snapshotMeta: { playersIds: playerIds }
    });
  }
}
