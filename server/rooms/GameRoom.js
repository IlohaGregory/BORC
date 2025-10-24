import { Room } from "@colyseus/core";
import { Schema, MapSchema, type } from "@colyseus/schema";

/* -------------------------
   Schema definitions
   ------------------------- */
class PlayerState extends Schema {
  constructor() {
    super();
    this.id = "";
    this.address = null;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.hp = 5;
    this.alive = true;
    this.score = 0;
  }
}
type("string")(PlayerState.prototype, "id");
type("string")(PlayerState.prototype, "address");
type("number")(PlayerState.prototype, "x");
type("number")(PlayerState.prototype, "y");
type("number")(PlayerState.prototype, "vx");
type("number")(PlayerState.prototype, "vy");
type("number")(PlayerState.prototype, "hp");
type("boolean")(PlayerState.prototype, "alive");
type("number")(PlayerState.prototype, "score");

class EnemyState extends Schema {
  constructor() {
    super();
    this.id = "";
    this.x = 0;
    this.y = 0;
    this.hp = 3;
    this.alive = true;
  }
}
type("string")(EnemyState.prototype, "id");
type("number")(EnemyState.prototype, "x");
type("number")(EnemyState.prototype, "y");
type("number")(EnemyState.prototype, "hp");
type("boolean")(EnemyState.prototype, "alive");

class BulletState extends Schema {
  constructor() {
    super();
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.ttl = 60;
    this.owner = "";
  }
}
type("number")(BulletState.prototype, "x");
type("number")(BulletState.prototype, "y");
type("number")(BulletState.prototype, "vx");
type("number")(BulletState.prototype, "vy");
type("number")(BulletState.prototype, "ttl");
type("string")(BulletState.prototype, "owner");

class GameState extends Schema {
  constructor() {
    super();
    this.players = new MapSchema();
    this.enemies = new MapSchema();
    this.bullets = new MapSchema();
    this.tick = 0;
  }
}
type({ map: PlayerState })(GameState.prototype, "players");
type({ map: EnemyState })(GameState.prototype, "enemies");
type({ map: BulletState })(GameState.prototype, "bullets");
type("number")(GameState.prototype, "tick");

/* -------------------------
   GameRoom implementation
   ------------------------- */
export class GameRoom extends Room {
  onCreate(options) {
    this.setState(new GameState());

    this.sessionToPlayerKey = {};
    this.playerKeyToSession = {};

    this.allowedAddresses = (options?.allowedAddresses && Array.isArray(options.allowedAddresses))
      ? options.allowedAddresses.map(a => String(a).toLowerCase())
      : null;

    this._tickIntervalMs = 50; // 20 tps
    this.setSimulationInterval((deltaTime) => {
      try { this._tick(deltaTime); } catch (_) {}
    }, this._tickIntervalMs);

    this.onMessage("input", (client, data) => {
      try { this._handleInput(client, data); } catch (_) {}
    });

    this.onMessage("ping", (client) => client.send("pong", { t: Date.now() }));
  }

  onJoin(client, options) {
    if (!this.state) {
      try { client.leave(); } catch (_) {}
      return;
    }

    const supplied = options?.playerId || options?.playerKey || options?.address || null;
    const normalized = supplied ? String(supplied).toLowerCase() : null;
    const playerKey = normalized || client.sessionId;

    if (this.allowedAddresses && normalized && !this.allowedAddresses.includes(normalized)) {
      try { client.send("error", { message: "not-allowed" }); } catch (_) {}
      try { client.leave(); } catch (_) {}
      return;
    }

    this.sessionToPlayerKey[client.sessionId] = playerKey;
    this.playerKeyToSession[playerKey] = client.sessionId;

    if (this.state.players.has(playerKey)) return;

    const p = new PlayerState();
    p.id = playerKey;
    p.address = normalized || null;
    p.x = 160 + (Math.random() - 0.5) * 60;
    p.y = 90 + (Math.random() - 0.5) * 60;
    p.vx = 0; p.vy = 0; p.hp = 5; p.alive = true; p.score = 0;
    this.state.players.set(playerKey, p);
  }

  onLeave(client, consented) {
    try {
      const pk = this.sessionToPlayerKey[client.sessionId];
      if (pk) {
        delete this.playerKeyToSession[pk];
        delete this.sessionToPlayerKey[client.sessionId];
        const ps = this.state?.players?.get(pk);
        if (ps) ps.alive = false;
      }
    } catch (_) {}
  }

  onDispose() {}

  _handleInput(client, data) {
    const sess = client.sessionId;
    const playerKey = this.sessionToPlayerKey[sess] || sess;
    const players = this.state?.players;
    if (!players || !players.has(playerKey)) return;

    const p = players.get(playerKey);

    const speed = 80;
    let vx = 0, vy = 0;
    if (data.left) vx -= 1;
    if (data.right) vx += 1;
    if (data.up) vy -= 1;
    if (data.down) vy += 1;

    const mag = Math.hypot(vx, vy) || 1;
    vx = mag === 0 ? 0 : (vx / mag) * speed;
    vy = mag === 0 ? 0 : (vy / mag) * speed;

    p.vx = vx;
    p.vy = vy;

    if (data.shoot) this._handleShoot(playerKey, data);
  }

  _tick(deltaTime) {
    if (!this.state) return;
    const dt = (deltaTime ?? this._tickIntervalMs) / 1000;

    for (const [key, p] of this.state.players.entries()) {
      if (!p || !p.alive) continue;
      p.x += (p.vx || 0) * dt;
      p.y += (p.vy || 0) * dt;
      p.x = Math.max(-20, Math.min(340, p.x));
      p.y = Math.max(-20, Math.min(220, p.y));
      if (p.hp <= 0 && p.alive) p.alive = false;
    }

    if (Math.random() < 0.03) this._spawnEnemy();

    const alivePlayers = Array.from(this.state.players.values()).filter(x => x && x.alive);
    for (const [eid, e] of this.state.enemies.entries()) {
      if (!e || !e.alive) continue;
      if (alivePlayers.length === 0) continue;
      const target = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
      const dx = target.x - e.x, dy = target.y - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      const speed = 20;
      e.x += (dx / dist) * speed * dt;
      e.y += (dy / dist) * speed * dt;
      if (Math.hypot(e.x - target.x, e.y - target.y) < 6) {
        target.hp -= 1;
        if (target.hp <= 0) target.alive = false;
      }
    }

    const bulletsToDelete = [];
    for (const [id, b] of this.state.bullets.entries()) {
      if (!b) continue;
      b.x += (b.vx || 0) * dt;
      b.y += (b.vy || 0) * dt;
      b.ttl = (b.ttl || 60) - 1;
      if (b.ttl <= 0 || b.x < -50 || b.y < -50 || b.x > 400 || b.y > 300) {
        bulletsToDelete.push(id);
      } else {
        for (const [eid, e] of this.state.enemies.entries()) {
          if (!e || !e.alive) continue;
          if (Math.hypot(e.x - b.x, e.y - b.y) < 6) {
            e.hp -= 1;
            if (e.hp <= 0) e.alive = false;
            bulletsToDelete.push(id);
            break;
          }
        }
      }
    }
    for (const id of bulletsToDelete) this.state.bullets.delete(id);

    for (const [eid, e] of this.state.enemies.entries()) {
      if (!e.alive) this.state.enemies.delete(eid);
    }

    this.state.tick = (this.state.tick || 0) + 1;
  }

  _spawnEnemy() {
    const id = `e_${Math.random().toString(36).slice(2, 8)}`;
    const e = null;
    const edge = Math.floor(Math.random() * 4);
    if (edge === 0) { e.x = Math.random() * 320; e.y = -10; }
    else if (edge === 1) { e.x = 330; e.y = Math.random() * 180; }
    else if (edge === 2) { e.x = Math.random() * 320; e.y = 190; }
    else { e.x = -10; e.y = Math.random() * 180; }
    e.id = id; e.hp = 3; e.alive = true;
    this.state.enemies.set(id, e);
  }

  _handleShoot(playerKey, data) {
    const p = this.state.players.get(playerKey);
    if (!p) return;
    const id = `b_${Math.random().toString(36).slice(2, 8)}`;
    const bx = p.x, by = p.y;
    const aimX = data.aimX ?? (p.x + 20);
    const aimY = data.aimY ?? p.y;
    const dx = aimX - bx, dy = aimY - by;
    const dist = Math.hypot(dx, dy) || 1;
    const speed = 220;
    const bullet = new BulletState();
    bullet.x = bx; bullet.y = by;
    bullet.vx = (dx / dist) * speed;
    bullet.vy = (dy / dist) * speed;
    bullet.owner = playerKey;
    bullet.ttl = 60;
    this.state.bullets.set(id, bullet);
  }
}
