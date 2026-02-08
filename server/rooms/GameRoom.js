import { Room } from "@colyseus/core";
import { Schema, MapSchema, ArraySchema, type } from "@colyseus/schema";

// Import shared mission definitions
import {
  EnemyType, ENEMY_STATS, ObjectiveType, ObjectiveStatus, MissionStatus,
  OBJECTIVE_CONFIG, getMission, getSpawnWeights, pickEnemyType, getDifficultyMultiplier,
  generateProceduralMission, DIFFICULTY_CONFIG
} from "../../shared/missions.js";
import { selectTarget, TargetPriority } from "../../shared/targeting.js";

/* -------------------------
   Server-side config
   ------------------------- */
const SERVER_CFG = {
  player: { speed: 80, hp: 20, fireCooldownTicks: 4, iFramesTicks: 10 },
  bullet: { speed: 220, ttlTicks: 60 },
  combat: { autoFireRange: 150 },
  mission: { extractHoldTicks: 100, maxAlertLevel: 1.0, spawnMargin: 50 }
};

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
    this.hp = SERVER_CFG.player.hp;
    this.alive = true;
    this.score = 0;
    this.carrying = "";
    this.targetPriority = TargetPriority.CLOSEST;
    this.focusTargetId = "";
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
type("string")(PlayerState.prototype, "carrying");
type("string")(PlayerState.prototype, "targetPriority");
type("string")(PlayerState.prototype, "focusTargetId");

class EnemyState extends Schema {
  constructor() {
    super();
    this.id = "";
    this.type = EnemyType.SWARMER;
    this.x = 0;
    this.y = 0;
    this.hp = 1;
    this.maxHp = 1;
    this.alive = true;
    this.state = "chase";
    this.burrowed = false;
  }
}
type("string")(EnemyState.prototype, "id");
type("string")(EnemyState.prototype, "type");
type("number")(EnemyState.prototype, "x");
type("number")(EnemyState.prototype, "y");
type("number")(EnemyState.prototype, "hp");
type("number")(EnemyState.prototype, "maxHp");
type("boolean")(EnemyState.prototype, "alive");
type("string")(EnemyState.prototype, "state");
type("boolean")(EnemyState.prototype, "burrowed");

class BulletState extends Schema {
  constructor() {
    super();
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.ttl = SERVER_CFG.bullet.ttlTicks;
    this.owner = "";
  }
}
type("number")(BulletState.prototype, "x");
type("number")(BulletState.prototype, "y");
type("number")(BulletState.prototype, "vx");
type("number")(BulletState.prototype, "vy");
type("number")(BulletState.prototype, "ttl");
type("string")(BulletState.prototype, "owner");

class ProjectileState extends Schema {
  constructor() {
    super();
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.damage = 1;
    this.ttl = 60;
  }
}
type("number")(ProjectileState.prototype, "x");
type("number")(ProjectileState.prototype, "y");
type("number")(ProjectileState.prototype, "vx");
type("number")(ProjectileState.prototype, "vy");
type("number")(ProjectileState.prototype, "damage");
type("number")(ProjectileState.prototype, "ttl");

class ObjectiveState extends Schema {
  constructor() {
    super();
    this.id = "";
    this.type = "";
    this.x = 0;
    this.y = 0;
    this.status = ObjectiveStatus.PENDING;
    this.progress = 0;
    this.isPrimary = true;
    this.hp = 0;
  }
}
type("string")(ObjectiveState.prototype, "id");
type("string")(ObjectiveState.prototype, "type");
type("number")(ObjectiveState.prototype, "x");
type("number")(ObjectiveState.prototype, "y");
type("string")(ObjectiveState.prototype, "status");
type("number")(ObjectiveState.prototype, "progress");
type("boolean")(ObjectiveState.prototype, "isPrimary");
type("number")(ObjectiveState.prototype, "hp");

class NestState extends Schema {
  constructor() {
    super();
    this.id = "";
    this.objectiveId = "";
    this.x = 0;
    this.y = 0;
    this.hp = 15;
    this.alive = true;
  }
}
type("string")(NestState.prototype, "id");
type("string")(NestState.prototype, "objectiveId");
type("number")(NestState.prototype, "x");
type("number")(NestState.prototype, "y");
type("number")(NestState.prototype, "hp");
type("boolean")(NestState.prototype, "alive");

class MissionStateSchema extends Schema {
  constructor() {
    super();
    this.missionId = "";
    this.status = MissionStatus.BRIEFING;
    this.alertLevel = 0.02;
    this.extractionOpen = false;
    this.extractionTimer = 0;
    this.extractZoneX = 0;
    this.extractZoneY = 0;
    this.mapWidth = 600;
    this.mapHeight = 800;
  }
}
type("string")(MissionStateSchema.prototype, "missionId");
type("string")(MissionStateSchema.prototype, "status");
type("number")(MissionStateSchema.prototype, "alertLevel");
type("boolean")(MissionStateSchema.prototype, "extractionOpen");
type("number")(MissionStateSchema.prototype, "extractionTimer");
type("number")(MissionStateSchema.prototype, "extractZoneX");
type("number")(MissionStateSchema.prototype, "extractZoneY");
type("number")(MissionStateSchema.prototype, "mapWidth");
type("number")(MissionStateSchema.prototype, "mapHeight");

class GameState extends Schema {
  constructor() {
    super();
    this.players = new MapSchema();
    this.enemies = new MapSchema();
    this.bullets = new MapSchema();
    this.projectiles = new MapSchema();
    this.objectives = new MapSchema();
    this.nests = new MapSchema();
    this.mission = new MissionStateSchema();
    this.tick = 0;
  }
}
type({ map: PlayerState })(GameState.prototype, "players");
type({ map: EnemyState })(GameState.prototype, "enemies");
type({ map: BulletState })(GameState.prototype, "bullets");
type({ map: ProjectileState })(GameState.prototype, "projectiles");
type({ map: ObjectiveState })(GameState.prototype, "objectives");
type({ map: NestState })(GameState.prototype, "nests");
type(MissionStateSchema)(GameState.prototype, "mission");
type("number")(GameState.prototype, "tick");

/* -------------------------
   GameRoom implementation
   ------------------------- */
let _idCounter = 0;
function uid(prefix) { return `${prefix}_${(++_idCounter).toString(36)}`; }

export class GameRoom extends Room {
  onCreate(options) {
    this.setState(new GameState());

    this.sessionToPlayerKey = {};
    this.playerKeyToSession = {};
    this._lastFireTick = {};
    this._playerIFrames = {};
    this._playerLastAttackedBy = {};
    this._extractionProgress = {};

    // Enemy AI state (not synced to schema)
    this._enemyState = {};

    this.allowedAddresses = (options?.allowedAddresses && Array.isArray(options.allowedAddresses))
      ? options.allowedAddresses.map(a => String(a).toLowerCase())
      : null;

    // Mission setup - support both difficulty-based procedural and static missionId
    this.missionConfig = null;
    if (options?.difficulty) {
      // NEW: Procedural generation based on difficulty tier
      const mission = generateProceduralMission(options.difficulty);
      this._initMissionFromConfig(mission);
    } else if (options?.missionId) {
      // OLD: Static missions (backward compatibility)
      this._initMission(options.missionId);
    }

    this._tickIntervalMs = 50; // 20 tps
    this.setSimulationInterval((deltaTime) => {
      try {
        this._tick(deltaTime);
      } catch (err) {
        console.error('[GameRoom] tick error:', err);
      }
    }, this._tickIntervalMs);

    this.onMessage("input", (client, data) => {
      try { this._handleInput(client, data); } catch (_) {}
    });

    this.onMessage("setPriority", (client, data) => {
      const pk = this.sessionToPlayerKey[client.sessionId];
      const p = this.state?.players?.get(pk);
      if (p && Object.values(TargetPriority).includes(data.priority)) {
        p.targetPriority = data.priority;
      }
    });

    this.onMessage("setFocus", (client, data) => {
      const pk = this.sessionToPlayerKey[client.sessionId];
      const p = this.state?.players?.get(pk);
      if (p) {
        p.focusTargetId = data.targetId || "";
      }
    });

    this.onMessage("ping", (client) => client.send("pong", { t: Date.now() }));
  }

  _initMission(missionId) {
    const mission = getMission(missionId);
    if (!mission) return;
    this._initMissionFromConfig(mission);
  }

  _initMissionFromConfig(mission) {
    if (!mission) return;

    this.missionConfig = mission;
    const m = this.state.mission;
    m.missionId = mission.id;
    m.status = MissionStatus.DROP_IN;
    m.alertLevel = mission.baseAlertLevel;
    m.extractZoneX = mission.extractZone.x;
    m.extractZoneY = mission.extractZone.y;
    m.mapWidth = mission.mapWidth;
    m.mapHeight = mission.mapHeight;
    m.extractionTimer = mission.extractionTimer;

    // Create objectives
    mission.primaryObjectives.forEach((obj, i) => {
      const id = `obj_${i}`;
      const objState = new ObjectiveState();
      objState.id = id;
      objState.type = obj.type;
      objState.x = obj.x;
      objState.y = obj.y;
      objState.status = ObjectiveStatus.PENDING;
      objState.isPrimary = true;
      if (obj.type === ObjectiveType.DESTROY_NEST) {
        objState.hp = obj.hp || OBJECTIVE_CONFIG[obj.type].hp;
      }
      this.state.objectives.set(id, objState);

      // Create nest entity
      if (obj.type === ObjectiveType.DESTROY_NEST) {
        const nestId = `nest_${i}`;
        const nest = new NestState();
        nest.id = nestId;
        nest.objectiveId = id;
        nest.x = obj.x;
        nest.y = obj.y;
        nest.hp = obj.hp || OBJECTIVE_CONFIG[obj.type].hp;
        nest.alive = true;
        this.state.nests.set(nestId, nest);
      }
    });

    mission.optionalObjectives.forEach((obj, i) => {
      const id = `opt_${i}`;
      const objState = new ObjectiveState();
      objState.id = id;
      objState.type = obj.type;
      objState.x = obj.x;
      objState.y = obj.y;
      objState.status = ObjectiveStatus.PENDING;
      objState.isPrimary = false;
      if (obj.type === ObjectiveType.DESTROY_NEST) {
        objState.hp = obj.hp || OBJECTIVE_CONFIG[obj.type].hp;
      }
      this.state.objectives.set(id, objState);

      if (obj.type === ObjectiveType.DESTROY_NEST) {
        const nestId = `nest_opt_${i}`;
        const nest = new NestState();
        nest.id = nestId;
        nest.objectiveId = id;
        nest.x = obj.x;
        nest.y = obj.y;
        nest.hp = obj.hp || OBJECTIVE_CONFIG[obj.type].hp;
        nest.alive = true;
        this.state.nests.set(nestId, nest);
      }
    });

    // Start mission after brief delay
    this.clock.setTimeout(() => {
      if (this.state.mission) {
        this.state.mission.status = MissionStatus.ACTIVE;
      }
    }, 1500);
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

    // Spawn at drop zone if mission mode
    const dropX = this.missionConfig?.dropZone?.x || 160;
    const dropY = this.missionConfig?.dropZone?.y || (this.state.mission.mapHeight - 50);
    p.x = dropX + (Math.random() - 0.5) * 60;
    p.y = dropY + (Math.random() - 0.5) * 60;

    p.vx = 0; p.vy = 0;
    p.hp = SERVER_CFG.player.hp;
    p.alive = true;
    p.score = 0;
    this.state.players.set(playerKey, p);
    this._extractionProgress[playerKey] = 0;
  }

  async onAuth(client, options, request) {
    const playerId = options?.playerId || client.auth?.address;
    if (!playerId) throw new Error('No playerId');

    const normalized = playerId.toLowerCase();

    if (this.allowedAddresses && !this.allowedAddresses.includes(normalized)) {
      throw new Error('Unauthorized: Not in squad');
    }

    return { address: normalized };
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
    if (!p.alive) return;
    if (this.state.mission.status === MissionStatus.DROP_IN) return;

    const speed = SERVER_CFG.player.speed;
    let vx = 0, vy = 0;
    if (data.left) vx -= 1;
    if (data.right) vx += 1;
    if (data.up) vy -= 1;
    if (data.down) vy += 1;

    const mag = Math.hypot(vx, vy) || 1;
    vx = mag === 0 ? 0 : (vx / mag) * speed;
    vy = mag === 0 ? 0 : (vy / mag) * speed;

    // Speed reduction when carrying
    if (p.carrying) {
      vx *= 0.5;
      vy *= 0.5;
    }

    p.vx = vx;
    p.vy = vy;
  }

  _tick(deltaTime) {
    if (!this.state) return;
    const dt = (deltaTime ?? this._tickIntervalMs) / 1000;
    const currentTick = (this.state.tick || 0) + 1;
    const mapW = this.state.mission.mapWidth || 320;
    const mapH = this.state.mission.mapHeight || 200;

    // Update players
    for (const [key, p] of this.state.players.entries()) {
      if (!p || !p.alive) continue;
      p.x += (p.vx || 0) * dt;
      p.y += (p.vy || 0) * dt;
      p.x = Math.max(10, Math.min(mapW - 10, p.x));
      p.y = Math.max(10, Math.min(mapH - 10, p.y));
      if (p.hp <= 0 && p.alive) p.alive = false;
    }

    // Auto-fire for each player
    this._processAutoFire(currentTick);

    // Spawn enemies
    if (this.missionConfig) {
      this._spawnMissionEnemies();
    } else {
      if (Math.random() < 0.03) this._spawnLegacyEnemy();
    }

    // Update enemies
    this._updateEnemies(dt);

    // Update bullets
    this._updateBullets(dt, currentTick);

    // Update projectiles
    this._updateProjectiles(dt);

    // Mission logic
    if (this.missionConfig) {
      this._updateMission();
    }

    // Game over detection
    this._checkGameOver(currentTick);

    this.state.tick = currentTick;
  }

  _processAutoFire(currentTick) {
    const enemies = Array.from(this.state.enemies.values()).filter(e => e.alive && !e.burrowed);
    if (enemies.length === 0) return;

    for (const [key, p] of this.state.players.entries()) {
      if (!p.alive) continue;

      const lastFire = this._lastFireTick[key] || 0;
      if (currentTick - lastFire < SERVER_CFG.player.fireCooldownTicks) continue;

      // Find target
      let target = null;
      const range = SERVER_CFG.combat.autoFireRange;

      // Check focus target first
      if (p.focusTargetId) {
        target = this.state.enemies.get(p.focusTargetId);
        if (!target || !target.alive || target.burrowed) {
          p.focusTargetId = "";
          target = null;
        }
      }

      // Priority targeting
      if (!target) {
        const enemyList = enemies.map(e => ({
          id: e.id, x: e.x, y: e.y, hp: e.hp, type: e.type, alive: e.alive
        }));
        const player = {
          x: p.x, y: p.y,
          lastAttackedBy: this._playerLastAttackedBy[key]
        };
        target = selectTarget(player, enemyList, p.targetPriority || TargetPriority.CLOSEST, range);
        if (target) {
          target = this.state.enemies.get(target.id);
        }
      }

      if (target) {
        this._lastFireTick[key] = currentTick;
        this._fireBullet(p, target, key);
      }
    }
  }

  _fireBullet(player, target, ownerKey) {
    const id = uid('b');
    const bx = player.x, by = player.y;
    const dx = target.x - bx, dy = target.y - by;
    const dist = Math.hypot(dx, dy) || 1;
    const speed = SERVER_CFG.bullet.speed;

    const bullet = new BulletState();
    bullet.x = bx;
    bullet.y = by;
    bullet.vx = (dx / dist) * speed;
    bullet.vy = (dy / dist) * speed;
    bullet.owner = ownerKey;
    bullet.ttl = SERVER_CFG.bullet.ttlTicks;
    this.state.bullets.set(id, bullet);
  }

  _spawnMissionEnemies() {
    const m = this.state.mission;
    if (m.status !== MissionStatus.ACTIVE && m.status !== MissionStatus.EXTRACTION) return;

    // Apply spawn multiplier from difficulty config
    const spawnMult = this.missionConfig?.spawnMultiplier || 1.0;
    const spawnChance = m.alertLevel * 0.15 * spawnMult;
    if (Math.random() > spawnChance) return;

    const aliveCount = Array.from(this.state.enemies.values()).filter(e => e.alive).length;
    // Use maxEnemies from mission config, with extraction boost
    const baseMax = this.missionConfig?.maxEnemies || 20;
    const maxEnemies = m.extractionOpen ? Math.floor(baseMax * 1.5) : baseMax;
    if (aliveCount >= maxEnemies) return;

    // Increase alert during extraction
    if (m.extractionOpen) {
      m.alertLevel = Math.min(SERVER_CFG.mission.maxAlertLevel, m.alertLevel + 0.001);
    }

    const weights = getSpawnWeights(m.alertLevel, this.missionConfig?.difficulty || 1);
    const type = pickEnemyType(weights);
    this._spawnEnemyOfType(type);
  }

  _spawnEnemyOfType(type) {
    const stats = ENEMY_STATS[type];
    if (!stats) return;

    const id = uid('e');
    const mapW = this.state.mission.mapWidth;
    const mapH = this.state.mission.mapHeight;
    const margin = SERVER_CFG.mission.spawnMargin;

    let x, y;
    const edge = Math.floor(Math.random() * 4);
    if (edge === 0) { x = Math.random() * mapW; y = -margin; }
    else if (edge === 1) { x = mapW + margin; y = Math.random() * mapH; }
    else if (edge === 2) { x = Math.random() * mapW; y = mapH + margin; }
    else { x = -margin; y = Math.random() * mapH; }

    const e = new EnemyState();
    e.id = id;
    e.type = type;
    e.x = x;
    e.y = y;
    e.hp = stats.hp;
    e.maxHp = stats.hp;
    e.alive = true;
    e.state = "chase";
    e.burrowed = false;
    this.state.enemies.set(id, e);

    // AI state
    this._enemyState[id] = {
      speed: stats.speed,
      damage: stats.damage,
      stateTimer: 0,
      chargeVx: 0,
      chargeVy: 0,
      lastSpawn: 0,
      lastShot: 0,
      burrowTimer: 0
    };
  }

  _spawnLegacyEnemy() {
    const id = uid('e');
    const e = new EnemyState();
    const edge = Math.floor(Math.random() * 4);
    const mapW = this.state.mission.mapWidth || 320;
    const mapH = this.state.mission.mapHeight || 180;

    if (edge === 0) { e.x = Math.random() * mapW; e.y = -10; }
    else if (edge === 1) { e.x = mapW + 10; e.y = Math.random() * mapH; }
    else if (edge === 2) { e.x = Math.random() * mapW; e.y = mapH + 10; }
    else { e.x = -10; e.y = Math.random() * mapH; }

    e.id = id;
    e.type = EnemyType.SWARMER;
    e.hp = 2;
    e.maxHp = 2;
    e.alive = true;
    e.state = "chase";
    this.state.enemies.set(id, e);

    this._enemyState[id] = { speed: 30, damage: 1 };
  }

  _updateEnemies(dt) {
    const alivePlayers = Array.from(this.state.players.values()).filter(p => p.alive);
    if (alivePlayers.length === 0) return;

    for (const [eid, e] of this.state.enemies.entries()) {
      if (!e.alive) continue;

      const ai = this._enemyState[eid] || { speed: 30, damage: 1 };
      const target = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];

      switch (e.type) {
        case EnemyType.SWARMER:
          this._updateSwarmer(e, ai, target, dt);
          break;
        case EnemyType.SPITTER:
          this._updateSpitter(e, ai, target, dt);
          break;
        case EnemyType.CHARGER:
          this._updateCharger(e, ai, target, dt);
          break;
        case EnemyType.BROOD_MOTHER:
          this._updateBroodMother(e, ai, target, dt);
          break;
        case EnemyType.BURROWER:
          this._updateBurrower(e, ai, target, dt);
          break;
        default:
          this._updateSwarmer(e, ai, target, dt);
      }

      // Check collision with players
      if (!e.burrowed) {
        for (const p of alivePlayers) {
          if (Math.hypot(e.x - p.x, e.y - p.y) < 10) {
            this._damagePlayer(p, ai.damage || 1, e.id);
          }
        }
      }
    }
  }

  _updateSwarmer(e, ai, target, dt) {
    const dx = target.x - e.x;
    const dy = target.y - e.y;
    const dist = Math.hypot(dx, dy) || 1;
    e.x += (dx / dist) * ai.speed * dt;
    e.y += (dy / dist) * ai.speed * dt;
  }

  _updateSpitter(e, ai, target, dt) {
    const stats = ENEMY_STATS[EnemyType.SPITTER];
    const dx = target.x - e.x;
    const dy = target.y - e.y;
    const dist = Math.hypot(dx, dy);

    if (dist > stats.range) {
      e.x += (dx / dist) * ai.speed * dt;
      e.y += (dy / dist) * ai.speed * dt;
    } else if (dist < stats.range * 0.5) {
      e.x -= (dx / dist) * ai.speed * 0.5 * dt;
      e.y -= (dy / dist) * ai.speed * 0.5 * dt;
    }

    // Shoot
    const now = this.state.tick * this._tickIntervalMs;
    if (now - ai.lastShot > 2000 && dist <= stats.range) {
      ai.lastShot = now;
      this._fireProjectile(e, target.x, target.y, stats.projectileSpeed, ai.damage);
    }
  }

  _updateCharger(e, ai, target, dt) {
    const stats = ENEMY_STATS[EnemyType.CHARGER];
    const dx = target.x - e.x;
    const dy = target.y - e.y;
    const dist = Math.hypot(dx, dy);

    if (e.state === "chase") {
      e.x += (dx / (dist || 1)) * ai.speed * dt;
      e.y += (dy / (dist || 1)) * ai.speed * dt;
      if (dist < stats.chargeDistance) {
        e.state = "telegraph";
        ai.stateTimer = 500;
        ai.chargeTargetX = target.x;
        ai.chargeTargetY = target.y;
      }
    } else if (e.state === "telegraph") {
      ai.stateTimer -= this._tickIntervalMs;
      if (ai.stateTimer <= 0) {
        e.state = "charge";
        ai.stateTimer = 600;
        const tgt = { x: ai.chargeTargetX || target.x, y: ai.chargeTargetY || target.y };
        const chargeDist = Math.hypot(tgt.x - e.x, tgt.y - e.y) || 1;
        ai.chargeVx = ((tgt.x - e.x) / chargeDist) * stats.chargeSpeed;
        ai.chargeVy = ((tgt.y - e.y) / chargeDist) * stats.chargeSpeed;
      }
    } else if (e.state === "charge") {
      e.x += ai.chargeVx * dt;
      e.y += ai.chargeVy * dt;
      ai.stateTimer -= this._tickIntervalMs;
      if (ai.stateTimer <= 0) {
        e.state = "recover";
        ai.stateTimer = 800;
      }
    } else if (e.state === "recover") {
      ai.stateTimer -= this._tickIntervalMs;
      if (ai.stateTimer <= 0) {
        e.state = "chase";
      }
    }
  }

  _updateBroodMother(e, ai, target, dt) {
    const stats = ENEMY_STATS[EnemyType.BROOD_MOTHER];
    const dx = target.x - e.x;
    const dy = target.y - e.y;
    const dist = Math.hypot(dx, dy) || 1;

    e.x += (dx / dist) * ai.speed * dt;
    e.y += (dy / dist) * ai.speed * dt;

    const now = this.state.tick * this._tickIntervalMs;
    if (now - ai.lastSpawn > stats.spawnRate) {
      ai.lastSpawn = now;
      for (let i = 0; i < stats.spawnCount; i++) {
        this._spawnSwarmerNear(e.x, e.y);
      }
    }
  }

  _spawnSwarmerNear(x, y) {
    const stats = ENEMY_STATS[EnemyType.SWARMER];
    const id = uid('e');
    const angle = Math.random() * Math.PI * 2;
    const dist = 20 + Math.random() * 20;

    const e = new EnemyState();
    e.id = id;
    e.type = EnemyType.SWARMER;
    e.x = x + Math.cos(angle) * dist;
    e.y = y + Math.sin(angle) * dist;
    e.hp = stats.hp;
    e.maxHp = stats.hp;
    e.alive = true;
    e.state = "chase";
    this.state.enemies.set(id, e);

    this._enemyState[id] = { speed: stats.speed, damage: stats.damage };
  }

  _updateBurrower(e, ai, target, dt) {
    const stats = ENEMY_STATS[EnemyType.BURROWER];
    const dx = target.x - e.x;
    const dy = target.y - e.y;
    const dist = Math.hypot(dx, dy);

    if (e.burrowed) {
      ai.burrowTimer -= this._tickIntervalMs;
      if (ai.burrowTimer <= 0) {
        e.burrowed = false;
        e.x = target.x + (Math.random() - 0.5) * 40;
        e.y = target.y + (Math.random() - 0.5) * 40;
      }
    } else {
      e.x += (dx / (dist || 1)) * ai.speed * dt;
      e.y += (dy / (dist || 1)) * ai.speed * dt;

      if (dist > 150 && Math.random() < 0.01) {
        e.burrowed = true;
        ai.burrowTimer = stats.burrowTime;
      }
    }
  }

  _fireProjectile(enemy, targetX, targetY, speed, damage) {
    const id = uid('proj');
    const dx = targetX - enemy.x;
    const dy = targetY - enemy.y;
    const dist = Math.hypot(dx, dy) || 1;

    const proj = new ProjectileState();
    proj.x = enemy.x;
    proj.y = enemy.y;
    proj.vx = (dx / dist) * speed;
    proj.vy = (dy / dist) * speed;
    proj.damage = damage;
    proj.ttl = 60;
    this.state.projectiles.set(id, proj);
  }

  _updateBullets(dt, currentTick) {
    const bulletsToDelete = [];
    const mapW = this.state.mission.mapWidth || 320;
    const mapH = this.state.mission.mapHeight || 200;

    for (const [id, b] of this.state.bullets.entries()) {
      if (!b) continue;
      b.x += (b.vx || 0) * dt;
      b.y += (b.vy || 0) * dt;
      b.ttl = (b.ttl || 60) - 1;

      if (b.ttl <= 0 || b.x < -50 || b.y < -50 || b.x > mapW + 50 || b.y > mapH + 50) {
        bulletsToDelete.push(id);
        continue;
      }

      // Hit enemies
      for (const [eid, e] of this.state.enemies.entries()) {
        if (!e.alive || e.burrowed) continue;
        if (Math.hypot(e.x - b.x, e.y - b.y) < 8) {
          e.hp -= 1;
          if (e.hp <= 0) {
            e.alive = false;
            const stats = ENEMY_STATS[e.type];
            const owner = this.state.players.get(b.owner);
            if (owner) {
              owner.score += Math.floor((stats?.score || 1) * getDifficultyMultiplier(this.missionConfig?.difficulty || 1));
            }
            delete this._enemyState[eid];
          }
          bulletsToDelete.push(id);
          break;
        }
      }

      // Hit nests
      for (const [nid, n] of this.state.nests.entries()) {
        if (!n.alive) continue;
        if (Math.hypot(n.x - b.x, n.y - b.y) < 20) {
          n.hp -= 1;
          if (Math.random() < 0.3) {
            this._spawnSwarmerNear(n.x, n.y);
          }
          if (n.hp <= 0) {
            n.alive = false;
            this._completeNestObjective(n.objectiveId, b.owner);
          }
          bulletsToDelete.push(id);
          break;
        }
      }
    }

    for (const id of bulletsToDelete) {
      this.state.bullets.delete(id);
    }
  }

  _updateProjectiles(dt) {
    const toDelete = [];
    const alivePlayers = Array.from(this.state.players.values()).filter(p => p.alive);

    for (const [id, p] of this.state.projectiles.entries()) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.ttl--;

      // Hit players
      for (const player of alivePlayers) {
        if (Math.hypot(p.x - player.x, p.y - player.y) < 10) {
          this._damagePlayer(player, p.damage, null);
          toDelete.push(id);
          break;
        }
      }

      if (p.ttl <= 0) {
        toDelete.push(id);
      }
    }

    for (const id of toDelete) {
      this.state.projectiles.delete(id);
    }
  }

  _damagePlayer(player, damage, attackerId) {
    const currentTick = this.state.tick || 0;
    const iFrameUntil = this._playerIFrames[player.id] || 0;
    if (currentTick < iFrameUntil) return;

    player.hp -= damage;
    this._playerIFrames[player.id] = currentTick + SERVER_CFG.player.iFramesTicks;
    this._playerLastAttackedBy[player.id] = attackerId;

    if (player.hp <= 0) {
      player.alive = false;
    }
  }

  _completeNestObjective(objectiveId, ownerKey) {
    const obj = this.state.objectives.get(objectiveId);
    if (!obj) return;

    obj.status = ObjectiveStatus.COMPLETED;
    const config = OBJECTIVE_CONFIG[obj.type];
    const owner = this.state.players.get(ownerKey);
    if (owner) {
      owner.score += config?.completionReward || 50;
    }

    this._checkPrimaryObjectives();
  }

  _checkPrimaryObjectives() {
    const primaries = Array.from(this.state.objectives.values()).filter(o => o.isPrimary);
    const allComplete = primaries.every(o => o.status === ObjectiveStatus.COMPLETED);

    if (allComplete && !this.state.mission.extractionOpen) {
      this.state.mission.extractionOpen = true;
      this.state.mission.status = MissionStatus.EXTRACTION;
      this.state.mission.alertLevel = Math.min(SERVER_CFG.mission.maxAlertLevel, this.state.mission.alertLevel + 0.3);
      this.broadcast('extraction_open', { timer: this.state.mission.extractionTimer });
    }
  }

  _updateMission() {
    const m = this.state.mission;
    if (m.status === MissionStatus.DROP_IN) return;

    // Alert growth
    if (m.status === MissionStatus.ACTIVE && this.missionConfig) {
      m.alertLevel = Math.min(SERVER_CFG.mission.maxAlertLevel, m.alertLevel + this.missionConfig.alertGrowth);
    }

    // Check terminal objectives
    for (const [id, obj] of this.state.objectives.entries()) {
      if (obj.status !== ObjectiveStatus.PENDING && obj.status !== ObjectiveStatus.IN_PROGRESS) continue;
      if (obj.type !== ObjectiveType.ACTIVATE_TERMINAL) continue;

      const config = OBJECTIVE_CONFIG[obj.type];
      let anyPlayerInZone = false;

      for (const [pk, p] of this.state.players.entries()) {
        if (!p.alive) continue;
        const dist = Math.hypot(p.x - obj.x, p.y - obj.y);
        if (dist < config.radius) {
          anyPlayerInZone = true;
          break;
        }
      }

      if (anyPlayerInZone) {
        obj.status = ObjectiveStatus.IN_PROGRESS;
        obj.progress += this._tickIntervalMs;
        if (obj.progress >= config.holdTime) {
          obj.status = ObjectiveStatus.COMPLETED;
          // Give score to all players in zone
          for (const [pk, p] of this.state.players.entries()) {
            if (!p.alive) continue;
            const dist = Math.hypot(p.x - obj.x, p.y - obj.y);
            if (dist < config.radius) {
              p.score += Math.floor(config.completionReward / this.state.players.size);
            }
          }
          this._checkPrimaryObjectives();
        }
      }
    }

    // Extraction logic
    if (m.extractionOpen) {
      m.extractionTimer -= this._tickIntervalMs;

      const extractConfig = OBJECTIVE_CONFIG[ObjectiveType.EXTRACT];
      const alivePlayers = Array.from(this.state.players.values()).filter(p => p.alive);
      let allExtracted = true;

      for (const p of alivePlayers) {
        const dist = Math.hypot(p.x - m.extractZoneX, p.y - m.extractZoneY);
        if (dist < extractConfig.radius) {
          this._extractionProgress[p.id] = (this._extractionProgress[p.id] || 0) + this._tickIntervalMs;
        } else {
          this._extractionProgress[p.id] = Math.max(0, (this._extractionProgress[p.id] || 0) - this._tickIntervalMs * 0.5);
          allExtracted = false;
        }

        if ((this._extractionProgress[p.id] || 0) < SERVER_CFG.mission.extractHoldTicks * this._tickIntervalMs) {
          allExtracted = false;
        }
      }

      if (alivePlayers.length > 0 && allExtracted) {
        this._missionComplete();
        return;
      }

      // Time ran out
      if (m.extractionTimer <= 0) {
        this._missionFailed("extraction_timeout");
      }
    }
  }

  _missionComplete() {
    this.state.mission.status = MissionStatus.COMPLETED;

    // Bonus for optional objectives
    const optionals = Array.from(this.state.objectives.values()).filter(o => !o.isPrimary && o.status === ObjectiveStatus.COMPLETED);
    const extractBonus = OBJECTIVE_CONFIG[ObjectiveType.EXTRACT].completionReward;

    const scores = {};
    for (const [pk, p] of this.state.players.entries()) {
      p.score += optionals.length * 50 + extractBonus;
      scores[pk] = p.score;
    }

    this.broadcast('mission_complete', {
      scores,
      missionId: this.missionConfig?.id,
      objectives: Array.from(this.state.objectives.values()).map(o => ({ id: o.id, status: o.status }))
    });

    this.clock.setTimeout(() => this.disconnect(), 3000);
  }

  _missionFailed(reason) {
    this.state.mission.status = MissionStatus.FAILED;

    const scores = {};
    for (const [pk, p] of this.state.players.entries()) {
      scores[pk] = p.score;
    }

    this.broadcast('mission_failed', { reason, scores });
    this.clock.setTimeout(() => this.disconnect(), 3000);
  }

  _checkGameOver(currentTick) {
    if (this.state.players.size === 0) return;

    const anyAlive = Array.from(this.state.players.values()).some(p => p.alive);
    if (!anyAlive) {
      if (this.missionConfig) {
        this._missionFailed("all_dead");
      } else {
        const scores = {};
        for (const [k, p] of this.state.players.entries()) {
          scores[k] = p.score || 0;
        }
        this.broadcast('gameover', { scores, tick: currentTick });
        this.clock.setTimeout(() => this.disconnect(), 2000);
      }
    }
  }
}
