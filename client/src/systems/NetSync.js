// NetSync.js
// Handles state synchronization and interpolation for multiplayer

export default class NetSync {
  constructor(networkService, scene, opts = {}) {
    this.networkService = networkService;
    this.scene = scene;

    // interpolation delay: increase for smoother playback
    this.INTERP_MS = opts.interpMs ?? 180;

    this.snapshots = [];
    this.maxSnapshots = opts.maxSnapshots ?? 60;
    this._latestState = null;

    this._onState = null;
  }

  getLatestState() {
    return this._latestState;
  }

  async start() {
    this._onState = (s) => {
      this._latestState = s;

      const snap = {
        t: Date.now(),
        tick: s.tick || 0,
        players: {},
        enemies: {},
        bullets: {},
        projectiles: {},
        nests: {},
        objectives: {},
        mission: {}
      };

      // Helper to convert MapSchema or plain object
      const toPlain = (collection) => {
        if (!collection) return {};
        if (typeof collection.toJSON === 'function') return collection.toJSON();
        return { ...collection };
      };

      // Players
      const plainPlayers = toPlain(s.players);
      for (const id in plainPlayers) {
        const p = plainPlayers[id];
        snap.players[id] = {
          x: p.x, y: p.y, hp: p.hp, alive: p.alive, score: p.score, id,
          carrying: p.carrying, targetPriority: p.targetPriority, focusTargetId: p.focusTargetId
        };
      }

      // Enemies
      const plainEnemies = toPlain(s.enemies);
      for (const id in plainEnemies) {
        const e = plainEnemies[id];
        snap.enemies[id] = {
          x: e.x, y: e.y, hp: e.hp, maxHp: e.maxHp, alive: e.alive, id,
          type: e.type, state: e.state, burrowed: e.burrowed
        };
      }

      // Bullets
      const plainBullets = toPlain(s.bullets);
      for (const id in plainBullets) {
        const b = plainBullets[id];
        snap.bullets[id] = { x: b.x, y: b.y, vx: b.vx, vy: b.vy, owner: b.owner, id };
      }

      // Projectiles (enemy projectiles)
      const plainProjectiles = toPlain(s.projectiles);
      for (const id in plainProjectiles) {
        const p = plainProjectiles[id];
        snap.projectiles[id] = { x: p.x, y: p.y, vx: p.vx, vy: p.vy, damage: p.damage, id };
      }

      // Nests
      const plainNests = toPlain(s.nests);
      for (const id in plainNests) {
        const n = plainNests[id];
        snap.nests[id] = { x: n.x, y: n.y, hp: n.hp, alive: n.alive, objectiveId: n.objectiveId, id };
      }

      // Objectives
      const plainObjectives = toPlain(s.objectives);
      for (const id in plainObjectives) {
        const o = plainObjectives[id];
        snap.objectives[id] = {
          x: o.x, y: o.y, type: o.type, status: o.status, progress: o.progress,
          isPrimary: o.isPrimary, hp: o.hp, id
        };
      }

      // Mission state
      if (s.mission) {
        const m = s.mission;
        snap.mission = {
          missionId: m.missionId,
          status: m.status,
          alertLevel: m.alertLevel,
          extractionOpen: m.extractionOpen,
          extractionTimer: m.extractionTimer,
          extractZoneX: m.extractZoneX,
          extractZoneY: m.extractZoneY,
          mapWidth: m.mapWidth,
          mapHeight: m.mapHeight,
          extractZone: { x: m.extractZoneX, y: m.extractZoneY }
        };
      }

      this.snapshots.push(snap);
      if (this.snapshots.length > this.maxSnapshots) this.snapshots.shift();
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
  }

  stop() {
    try { this.networkService.gameRoom?.removeListener?.('state', this._onState); } catch (e) {}
    this.snapshots = [];
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
      if (!latest) {
        return callback({
          players: {}, enemies: {}, bullets: {}, projectiles: {},
          nests: {}, objectives: {}, mission: {},
          snapshotMeta: { playersIds: [] }
        });
      }
      return callback({
        players: latest.players,
        enemies: latest.enemies,
        bullets: latest.bullets,
        projectiles: latest.projectiles,
        nests: latest.nests,
        objectives: latest.objectives,
        mission: latest.mission,
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
        outPlayers[id] = { ...nb, x: safeNum(nb.x), y: safeNum(nb.y), hp: safeNum(nb.hp) };
        continue;
      }
      if (!nb && oa) {
        outPlayers[id] = { ...oa, x: safeNum(oa.x), y: safeNum(oa.y), hp: safeNum(oa.hp) };
        continue;
      }
      // both exist: interpolate numeric fields
      outPlayers[id] = {
        ...nb,
        x: this._lerp(safeNum(oa.x), safeNum(nb.x), factor),
        y: this._lerp(safeNum(oa.y), safeNum(nb.y), factor),
        hp: this._lerp(safeNum(oa.hp), safeNum(nb.hp), factor),
        alive: !!nb.alive,
        score: safeNum(nb.score)
      };
    }

    // enemies
    const outEnemies = {};
    const enemyIds = unionKeys(older.enemies, newer.enemies);
    for (const id of enemyIds) {
      const oa = older.enemies[id];
      const nb = newer.enemies[id];
      if (!oa && nb) {
        outEnemies[id] = { ...nb, x: safeNum(nb.x), y: safeNum(nb.y), hp: safeNum(nb.hp) };
        continue;
      }
      if (!nb && oa) {
        outEnemies[id] = { ...oa, x: safeNum(oa.x), y: safeNum(oa.y), hp: safeNum(oa.hp) };
        continue;
      }
      outEnemies[id] = {
        ...nb,
        x: this._lerp(safeNum(oa.x), safeNum(nb.x), factor),
        y: this._lerp(safeNum(oa.y), safeNum(nb.y), factor),
        hp: this._lerp(safeNum(oa.hp), safeNum(nb.hp), factor),
        alive: !!nb.alive
      };
    }

    // bullets
    const outBullets = {};
    const bulletIds = unionKeys(older.bullets, newer.bullets);
    for (const id of bulletIds) {
      const oa = older.bullets[id];
      const nb = newer.bullets[id];
      if (!oa && nb) {
        outBullets[id] = { ...nb, x: safeNum(nb.x), y: safeNum(nb.y) };
        continue;
      }
      if (!nb && oa) {
        outBullets[id] = { ...oa, x: safeNum(oa.x), y: safeNum(oa.y) };
        continue;
      }
      outBullets[id] = {
        ...nb,
        x: this._lerp(safeNum(oa.x), safeNum(nb.x), factor),
        y: this._lerp(safeNum(oa.y), safeNum(nb.y), factor),
        vx: this._lerp(safeNum(oa.vx), safeNum(nb.vx), factor),
        vy: this._lerp(safeNum(oa.vy), safeNum(nb.vy), factor)
      };
    }

    // projectiles
    const outProjectiles = {};
    const projIds = unionKeys(older.projectiles, newer.projectiles);
    for (const id of projIds) {
      const oa = older.projectiles[id];
      const nb = newer.projectiles[id];
      if (!oa && nb) {
        outProjectiles[id] = { ...nb, x: safeNum(nb.x), y: safeNum(nb.y) };
        continue;
      }
      if (!nb && oa) {
        outProjectiles[id] = { ...oa, x: safeNum(oa.x), y: safeNum(oa.y) };
        continue;
      }
      outProjectiles[id] = {
        ...nb,
        x: this._lerp(safeNum(oa.x), safeNum(nb.x), factor),
        y: this._lerp(safeNum(oa.y), safeNum(nb.y), factor)
      };
    }

    // nests (static position, just use newer)
    const outNests = { ...newer.nests };

    // objectives (static position, just use newer)
    const outObjectives = { ...newer.objectives };

    // mission state (use newer, interpolate timer)
    const outMission = { ...newer.mission };
    if (older.mission && newer.mission) {
      outMission.extractionTimer = this._lerp(
        safeNum(older.mission.extractionTimer),
        safeNum(newer.mission.extractionTimer),
        factor
      );
      outMission.alertLevel = this._lerp(
        safeNum(older.mission.alertLevel),
        safeNum(newer.mission.alertLevel),
        factor
      );
    }

    callback({
      players: outPlayers,
      enemies: outEnemies,
      bullets: outBullets,
      projectiles: outProjectiles,
      nests: outNests,
      objectives: outObjectives,
      mission: outMission,
      snapshotMeta: { playersIds: playerIds }
    });
  }
}
