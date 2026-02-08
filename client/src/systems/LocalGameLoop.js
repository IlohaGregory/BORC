// LocalGameLoop.js
// Solo mode game loop with mission support

import { CFG } from '../core/Config.js';
import {
  EnemyType, ENEMY_STATS, ObjectiveType, ObjectiveStatus, MissionStatus,
  OBJECTIVE_CONFIG, getMission, getSpawnWeights, pickEnemyType, getDifficultyMultiplier,
  generateProceduralMission, DIFFICULTY_CONFIG
} from '../../../shared/missions.js';
import { selectTarget, TargetPriority } from '../../../shared/targeting.js';

let _idCounter = 0;
function uid(prefix) { return `${prefix}_${(++_idCounter).toString(36)}`; }

export default class LocalGameLoop {
  /**
   * @param {Phaser.Scene} scene
   * @param {string|null} missionId - Static mission ID (legacy)
   * @param {number|null} difficulty - Difficulty tier for procedural generation (1, 2, or 3)
   */
  constructor(scene, missionId = null, difficulty = null) {
    this.scene = scene;
    this._interval = null;
    this._tickMs = 50; // 20 TPS

    // Mission config - prefer difficulty-based procedural generation
    this.difficulty = difficulty;
    this.missionId = missionId;

    if (difficulty) {
      // NEW: Procedural generation based on difficulty tier
      this.mission = generateProceduralMission(difficulty);
      this.missionId = this.mission.id;
    } else if (missionId) {
      // OLD: Static missions (backward compatibility)
      this.mission = getMission(missionId);
    } else {
      this.mission = null;
    }
    this.missionMode = !!this.mission;

    // Map dimensions
    this.mapWidth = this.mission?.mapWidth || 320;
    this.mapHeight = this.mission?.mapHeight || 200;

    // Player state
    this.player = {
      x: this.mission?.dropZone?.x || 160,
      y: this.mission?.dropZone?.y || this.mapHeight - 50,
      vx: 0, vy: 0,
      hp: CFG.player.hp,
      alive: true,
      score: 0,
      iFramesUntil: 0,
      carrying: null, // For sample retrieval objectives
      lastAttackedBy: null
    };

    // Game state
    this.enemies = {};
    this.bullets = {};
    this.projectiles = {}; // Enemy projectiles (spitter acid)
    this.objectives = {};
    this.nests = {};

    // Mission state
    this.missionStatus = this.missionMode ? MissionStatus.DROP_IN : MissionStatus.ACTIVE;
    this.alertLevel = this.mission?.baseAlertLevel || 0.02;
    this.extractionOpen = false;
    this.extractionTimer = 0;
    this.extractionProgress = 0;

    // Legacy wave support (non-mission mode)
    this.wave = 1;
    this._enemiesRemaining = 0;

    // Internal
    this._tick = 0;
    this._lastFireTick = 0;
    this._gameOver = false;
    this._onGameOver = null;
    this._onMissionComplete = null;
    this._onObjectiveUpdate = null;

    // Combat state
    this.targetPriority = TargetPriority.CLOSEST;
    this.focusTargetId = null;

    // Initialize mission objectives
    if (this.missionMode) {
      this._initMission();
    }
  }

  _initMission() {
    // Create objectives from mission config
    this.mission.primaryObjectives.forEach((obj, i) => {
      const id = `obj_${i}`;
      this.objectives[id] = {
        id,
        ...obj,
        status: ObjectiveStatus.PENDING,
        progress: 0,
        isPrimary: true,
        config: OBJECTIVE_CONFIG[obj.type]
      };

      // Create nest entities for destroy_nest objectives
      if (obj.type === ObjectiveType.DESTROY_NEST) {
        const nestId = `nest_${i}`;
        this.nests[nestId] = {
          id: nestId,
          objectiveId: id,
          x: obj.x,
          y: obj.y,
          hp: OBJECTIVE_CONFIG[obj.type].hp,
          alive: true
        };
      }
    });

    this.mission.optionalObjectives.forEach((obj, i) => {
      const id = `opt_${i}`;
      this.objectives[id] = {
        id,
        ...obj,
        status: ObjectiveStatus.PENDING,
        progress: 0,
        isPrimary: false,
        config: OBJECTIVE_CONFIG[obj.type]
      };

      if (obj.type === ObjectiveType.DESTROY_NEST) {
        const nestId = `nest_opt_${i}`;
        this.nests[nestId] = {
          id: nestId,
          objectiveId: id,
          x: obj.x,
          y: obj.y,
          hp: OBJECTIVE_CONFIG[obj.type].hp,
          alive: true
        };
      }
    });
  }

  onGameOver(cb) { this._onGameOver = cb; }
  onMissionComplete(cb) { this._onMissionComplete = cb; }
  onObjectiveUpdate(cb) { this._onObjectiveUpdate = cb; }

  start() {
    if (this.missionMode) {
      // Brief drop-in phase
      this.missionStatus = MissionStatus.DROP_IN;
      setTimeout(() => {
        this.missionStatus = MissionStatus.ACTIVE;
      }, 1500);
    } else {
      this._startWave(1);
    }
    this._interval = setInterval(() => this._update(), this._tickMs);
  }

  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }

  getState() {
    return {
      players: {
        local: {
          x: this.player.x,
          y: this.player.y,
          hp: this.player.hp,
          alive: this.player.alive,
          score: this.player.score,
          carrying: this.player.carrying
        }
      },
      enemies: { ...this.enemies },
      bullets: { ...this.bullets },
      projectiles: { ...this.projectiles },
      objectives: { ...this.objectives },
      nests: { ...this.nests },
      mission: {
        status: this.missionStatus,
        alertLevel: this.alertLevel,
        extractionOpen: this.extractionOpen,
        extractionTimer: this.extractionTimer,
        extractionProgress: this.extractionProgress,
        extractZone: this.mission?.extractZone
      },
      mapWidth: this.mapWidth,
      mapHeight: this.mapHeight
    };
  }

  getMissionState() {
    return {
      status: this.missionStatus,
      objectives: Object.values(this.objectives),
      alertLevel: this.alertLevel,
      extractionOpen: this.extractionOpen,
      extractionTimer: this.extractionTimer,
      extractionProgress: this.extractionProgress
    };
  }

  // Combat control methods
  setTargetPriority(priority) {
    this.targetPriority = priority;
  }

  setFocusTarget(enemyId) {
    this.focusTargetId = enemyId;
  }

  clearFocusTarget() {
    this.focusTargetId = null;
  }

  // Legacy wave support
  _startWave(num) {
    this.wave = num;
    const wCfg = CFG.wave;
    this._enemiesRemaining = wCfg.enemiesBase + wCfg.enemiesPerWave * (num - 1);
  }

  _update() {
    if (this._gameOver) return;
    this._tick++;
    const dt = this._tickMs / 1000;

    // Input & movement
    this._processInput(dt);

    // Spawn enemies
    if (this.missionMode) {
      this._spawnMissionEnemies();
    } else {
      this._spawnWaveEnemies();
    }

    // Update entities
    this._updateEnemies(dt);
    this._updateBullets(dt);
    this._updateProjectiles(dt);

    // Collisions
    this._checkCollisions();

    // Mission logic
    if (this.missionMode) {
      this._updateMission(dt);
    } else {
      this._checkWaveProgress();
    }

    // Game over check
    if (!this.player.alive && !this._gameOver) {
      this._gameOver = true;
      this.missionStatus = MissionStatus.FAILED;
      if (this._onGameOver) {
        this._onGameOver({
          score: this.player.score,
          wave: this.wave,
          missionStatus: this.missionStatus
        });
      }
    }
  }

  _processInput(dt) {
    if (!this.player.alive) return;
    if (this.missionStatus === MissionStatus.DROP_IN) return;

    const registry = this.scene.registry.get('input') || { vector: { x: 0, y: 0 }, aim: null, aimHeld: false };
    const vx = registry.vector.x;
    const vy = registry.vector.y;

    // Keyboard fallback
    const keys = this.scene.keys;
    const keyVX = keys ? ((keys.D?.isDown ? 1 : 0) - (keys.A?.isDown ? 1 : 0)) : 0;
    const keyVY = keys ? ((keys.S?.isDown ? 1 : 0) - (keys.W?.isDown ? 1 : 0)) : 0;
    const finalVX = vx || keyVX;
    const finalVY = vy || keyVY;

    // Speed (reduced when carrying)
    let speed = CFG.player.speed;
    if (this.player.carrying) {
      speed *= CFG.player.carryingSpeedMult;
    }

    const mag = Math.hypot(finalVX, finalVY);
    if (mag > 0) {
      this.player.vx = (finalVX / mag) * speed;
      this.player.vy = (finalVY / mag) * speed;
    } else {
      this.player.vx = 0;
      this.player.vy = 0;
    }

    // Move player
    this.player.x += this.player.vx * dt;
    this.player.y += this.player.vy * dt;

    // Clamp to map bounds
    this.player.x = Math.max(10, Math.min(this.mapWidth - 10, this.player.x));
    this.player.y = Math.max(10, Math.min(this.mapHeight - 10, this.player.y));

    // Auto-fire combat
    this._processAutoFire();
  }

  _processAutoFire() {
    const enemies = Object.values(this.enemies).filter(e => e.alive);
    if (enemies.length === 0) return;

    const range = CFG.combat.autoFireRange;
    const cooldownTicks = Math.ceil(CFG.combat.autoFireCooldownMs / this._tickMs);

    if (this._tick - this._lastFireTick < cooldownTicks) return;

    // Find target using priority system
    let target = null;

    // Check focus target first
    if (this.focusTargetId) {
      target = enemies.find(e => e.id === this.focusTargetId);
      if (!target || !target.alive) {
        this.focusTargetId = null;
        target = null;
      }
    }

    // Use priority targeting if no focus
    if (!target) {
      target = selectTarget(
        { x: this.player.x, y: this.player.y, lastAttackedBy: this.player.lastAttackedBy },
        enemies,
        this.targetPriority,
        range
      );
    }

    if (target) {
      this._lastFireTick = this._tick;
      this._fireBullet(target.x, target.y);
    }
  }

  _fireBullet(aimX, aimY) {
    const bx = this.player.x, by = this.player.y;
    const dx = aimX - bx, dy = aimY - by;
    const dist = Math.hypot(dx, dy) || 1;
    const speed = CFG.bullet.speed;
    const id = uid('b');
    this.bullets[id] = {
      x: bx, y: by,
      vx: (dx / dist) * speed,
      vy: (dy / dist) * speed,
      ttl: Math.ceil(CFG.bullet.ttlMs / this._tickMs),
      owner: 'local'
    };
  }

  _spawnMissionEnemies() {
    if (this.missionStatus !== MissionStatus.ACTIVE && this.missionStatus !== MissionStatus.EXTRACTION) return;

    // Apply spawn multiplier from mission config (procedural missions have this)
    const spawnMult = this.mission?.spawnMultiplier || 1.0;
    const spawnChance = this.alertLevel * 0.15 * spawnMult;
    if (Math.random() > spawnChance) return;

    // Limit enemy count - use maxEnemies from mission config
    const aliveCount = Object.values(this.enemies).filter(e => e.alive).length;
    const baseMax = this.mission?.maxEnemies || 20;
    const maxEnemies = this.extractionOpen ? Math.floor(baseMax * 1.5) : baseMax;
    if (aliveCount >= maxEnemies) return;

    // Increase alert during extraction
    if (this.extractionOpen) {
      this.alertLevel = Math.min(CFG.mission.maxAlertLevel, this.alertLevel + 0.001);
    }

    const weights = getSpawnWeights(this.alertLevel, this.mission?.difficulty || 1);
    const type = pickEnemyType(weights);
    this._spawnEnemyOfType(type);
  }

  _spawnEnemyOfType(type) {
    const stats = ENEMY_STATS[type];
    if (!stats) return;

    const id = uid('e');
    let x, y;

    // Spawn from edges
    const edge = Math.floor(Math.random() * 4);
    const margin = CFG.mission.spawnMargin;

    if (edge === 0) { x = Math.random() * this.mapWidth; y = -margin; }
    else if (edge === 1) { x = this.mapWidth + margin; y = Math.random() * this.mapHeight; }
    else if (edge === 2) { x = Math.random() * this.mapWidth; y = this.mapHeight + margin; }
    else { x = -margin; y = Math.random() * this.mapHeight; }

    this.enemies[id] = {
      id,
      type,
      x, y,
      hp: stats.hp,
      maxHp: stats.hp,
      speed: stats.speed,
      damage: stats.damage,
      alive: true,
      // Type-specific state
      state: 'chase',
      stateTimer: 0,
      lastAttack: 0,
      // For charger
      chargeTarget: null,
      // For brood mother
      lastSpawn: 0,
      // For burrower
      burrowed: false,
      burrowTimer: 0,
      // For spitter
      lastShot: 0
    };
  }

  _spawnWaveEnemies() {
    if (this._enemiesRemaining > 0 && this._tick % 4 === 0) {
      this._spawnLegacyEnemy();
      this._enemiesRemaining--;
    }
  }

  _spawnLegacyEnemy() {
    const wCfg = CFG.wave;
    const id = uid('e');
    const speedMult = 1 + wCfg.speedScale * (this.wave - 1);
    const hpBonus = Math.floor((this.wave - 1) / wCfg.hpScale);
    const hp = CFG.enemy.baseHP + hpBonus;

    let x, y;
    const edge = Math.floor(Math.random() * 4);
    if (edge === 0) { x = Math.random() * this.mapWidth; y = -10; }
    else if (edge === 1) { x = this.mapWidth + 10; y = Math.random() * this.mapHeight; }
    else if (edge === 2) { x = Math.random() * this.mapWidth; y = this.mapHeight + 10; }
    else { x = -10; y = Math.random() * this.mapHeight; }

    this.enemies[id] = {
      id,
      type: EnemyType.SWARMER,
      x, y,
      hp,
      maxHp: hp,
      speed: CFG.enemy.baseSpeed * speedMult,
      damage: 1,
      alive: true,
      state: 'chase'
    };
  }

  _updateEnemies(dt) {
    if (!this.player.alive) return;

    for (const id in this.enemies) {
      const e = this.enemies[id];
      if (!e.alive) continue;

      switch (e.type) {
        case EnemyType.SWARMER:
          this._updateSwarmer(e, dt);
          break;
        case EnemyType.SPITTER:
          this._updateSpitter(e, dt);
          break;
        case EnemyType.CHARGER:
          this._updateCharger(e, dt);
          break;
        case EnemyType.BROOD_MOTHER:
          this._updateBroodMother(e, dt);
          break;
        case EnemyType.BURROWER:
          this._updateBurrower(e, dt);
          break;
        default:
          this._updateSwarmer(e, dt);
      }
    }
  }

  _updateSwarmer(e, dt) {
    // Simple chase behavior
    const dx = this.player.x - e.x;
    const dy = this.player.y - e.y;
    const dist = Math.hypot(dx, dy) || 1;
    e.x += (dx / dist) * e.speed * dt;
    e.y += (dy / dist) * e.speed * dt;
  }

  _updateSpitter(e, dt) {
    const stats = ENEMY_STATS[EnemyType.SPITTER];
    const dx = this.player.x - e.x;
    const dy = this.player.y - e.y;
    const dist = Math.hypot(dx, dy);

    if (dist > stats.range) {
      // Move closer
      e.x += (dx / dist) * e.speed * dt;
      e.y += (dy / dist) * e.speed * dt;
    } else if (dist < stats.range * 0.5) {
      // Retreat if too close
      e.x -= (dx / dist) * e.speed * 0.5 * dt;
      e.y -= (dy / dist) * e.speed * 0.5 * dt;
    }

    // Shoot projectile
    const now = this._tick * this._tickMs;
    if (now - e.lastShot > 2000 && dist <= stats.range) {
      e.lastShot = now;
      this._fireEnemyProjectile(e, this.player.x, this.player.y, stats.projectileSpeed);
    }
  }

  _updateCharger(e, dt) {
    const stats = ENEMY_STATS[EnemyType.CHARGER];
    const dx = this.player.x - e.x;
    const dy = this.player.y - e.y;
    const dist = Math.hypot(dx, dy);

    if (e.state === 'chase') {
      // Move toward player
      e.x += (dx / dist) * e.speed * dt;
      e.y += (dy / dist) * e.speed * dt;

      // Start charge if in range
      if (dist < stats.chargeDistance) {
        e.state = 'telegraph';
        e.stateTimer = 500; // Telegraph for 500ms
        e.chargeTarget = { x: this.player.x, y: this.player.y };
      }
    } else if (e.state === 'telegraph') {
      e.stateTimer -= this._tickMs;
      if (e.stateTimer <= 0) {
        e.state = 'charge';
        e.stateTimer = 600; // Charge duration
        const target = e.chargeTarget || { x: this.player.x, y: this.player.y };
        const chargeDist = Math.hypot(target.x - e.x, target.y - e.y) || 1;
        e.chargeVx = ((target.x - e.x) / chargeDist) * stats.chargeSpeed;
        e.chargeVy = ((target.y - e.y) / chargeDist) * stats.chargeSpeed;
      }
    } else if (e.state === 'charge') {
      e.x += e.chargeVx * dt;
      e.y += e.chargeVy * dt;
      e.stateTimer -= this._tickMs;
      if (e.stateTimer <= 0) {
        e.state = 'recover';
        e.stateTimer = 800; // Recovery time
      }
    } else if (e.state === 'recover') {
      e.stateTimer -= this._tickMs;
      if (e.stateTimer <= 0) {
        e.state = 'chase';
      }
    }
  }

  _updateBroodMother(e, dt) {
    const stats = ENEMY_STATS[EnemyType.BROOD_MOTHER];
    const dx = this.player.x - e.x;
    const dy = this.player.y - e.y;
    const dist = Math.hypot(dx, dy) || 1;

    // Slow movement toward player
    e.x += (dx / dist) * e.speed * dt;
    e.y += (dy / dist) * e.speed * dt;

    // Spawn swarmers periodically
    const now = this._tick * this._tickMs;
    if (now - e.lastSpawn > stats.spawnRate) {
      e.lastSpawn = now;
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

    this.enemies[id] = {
      id,
      type: EnemyType.SWARMER,
      x: x + Math.cos(angle) * dist,
      y: y + Math.sin(angle) * dist,
      hp: stats.hp,
      maxHp: stats.hp,
      speed: stats.speed,
      damage: stats.damage,
      alive: true,
      state: 'chase'
    };
  }

  _updateBurrower(e, dt) {
    const stats = ENEMY_STATS[EnemyType.BURROWER];
    const dx = this.player.x - e.x;
    const dy = this.player.y - e.y;
    const dist = Math.hypot(dx, dy);

    if (e.burrowed) {
      e.burrowTimer -= this._tickMs;
      if (e.burrowTimer <= 0) {
        // Emerge near player
        e.burrowed = false;
        e.x = this.player.x + (Math.random() - 0.5) * 40;
        e.y = this.player.y + (Math.random() - 0.5) * 40;
      }
    } else {
      // Chase when not burrowed
      e.x += (dx / (dist || 1)) * e.speed * dt;
      e.y += (dy / (dist || 1)) * e.speed * dt;

      // Burrow if far from player
      if (dist > 150 && Math.random() < 0.01) {
        e.burrowed = true;
        e.burrowTimer = stats.burrowTime;
      }
    }
  }

  _fireEnemyProjectile(enemy, targetX, targetY, speed) {
    const id = uid('proj');
    const dx = targetX - enemy.x;
    const dy = targetY - enemy.y;
    const dist = Math.hypot(dx, dy) || 1;

    this.projectiles[id] = {
      id,
      x: enemy.x,
      y: enemy.y,
      vx: (dx / dist) * speed,
      vy: (dy / dist) * speed,
      damage: enemy.damage,
      ttl: 60 // ticks
    };
  }

  _updateBullets(dt) {
    const toDelete = [];
    for (const id in this.bullets) {
      const b = this.bullets[id];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.ttl--;
      if (b.ttl <= 0 || b.x < -50 || b.y < -50 || b.x > this.mapWidth + 50 || b.y > this.mapHeight + 50) {
        toDelete.push(id);
      }
    }
    for (const id of toDelete) delete this.bullets[id];
  }

  _updateProjectiles(dt) {
    const toDelete = [];
    for (const id in this.projectiles) {
      const p = this.projectiles[id];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.ttl--;

      // Check hit player
      if (Math.hypot(p.x - this.player.x, p.y - this.player.y) < 10) {
        this._damagePlayer(p.damage, null);
        toDelete.push(id);
        continue;
      }

      if (p.ttl <= 0) {
        toDelete.push(id);
      }
    }
    for (const id of toDelete) delete this.projectiles[id];
  }

  _checkCollisions() {
    // Bullet → Enemy
    const bulletsToDelete = [];
    for (const bid in this.bullets) {
      const b = this.bullets[bid];
      for (const eid in this.enemies) {
        const e = this.enemies[eid];
        if (!e.alive || e.burrowed) continue;
        if (Math.hypot(e.x - b.x, e.y - b.y) < 8) {
          e.hp -= CFG.bullet.damage;
          if (e.hp <= 0) {
            e.alive = false;
            const stats = ENEMY_STATS[e.type];
            this.player.score += (stats?.score || 1) * getDifficultyMultiplier(this.mission?.difficulty || 1);
          }
          bulletsToDelete.push(bid);
          break;
        }
      }
    }
    for (const id of bulletsToDelete) delete this.bullets[id];

    // Bullet → Nest
    for (const bid in this.bullets) {
      const b = this.bullets[bid];
      for (const nid in this.nests) {
        const n = this.nests[nid];
        if (!n.alive) continue;
        if (Math.hypot(n.x - b.x, n.y - b.y) < 20) {
          n.hp -= CFG.bullet.damage;
          // Spawn defenders when damaged
          if (Math.random() < 0.3) {
            this._spawnSwarmerNear(n.x, n.y);
          }
          if (n.hp <= 0) {
            n.alive = false;
            this._completeNestObjective(n.objectiveId);
          }
          delete this.bullets[bid];
          break;
        }
      }
    }

    // Enemy → Player (with i-frames)
    if (!this.player.alive) return;
    for (const eid in this.enemies) {
      const e = this.enemies[eid];
      if (!e.alive || e.burrowed) continue;
      if (Math.hypot(e.x - this.player.x, e.y - this.player.y) < 10) {
        this._damagePlayer(e.damage, e.id);
      }
    }

    // Cull dead enemies
    for (const eid in this.enemies) {
      if (!this.enemies[eid].alive) delete this.enemies[eid];
    }
  }

  _damagePlayer(damage, attackerId) {
    if (this._tick < this.player.iFramesUntil) return;

    this.player.hp -= damage;
    this.player.iFramesUntil = this._tick + Math.ceil(CFG.player.iFramesMs / this._tickMs);
    this.player.lastAttackedBy = attackerId;

    if (this.player.hp <= 0) {
      this.player.alive = false;
    }
  }

  _completeNestObjective(objectiveId) {
    const obj = this.objectives[objectiveId];
    if (!obj) return;

    obj.status = ObjectiveStatus.COMPLETED;
    this.player.score += obj.config?.completionReward || 50;

    if (this._onObjectiveUpdate) {
      this._onObjectiveUpdate(obj);
    }

    this._checkPrimaryObjectives();
  }

  _checkPrimaryObjectives() {
    const primaries = Object.values(this.objectives).filter(o => o.isPrimary);
    const allComplete = primaries.every(o => o.status === ObjectiveStatus.COMPLETED);

    if (allComplete && !this.extractionOpen) {
      this.extractionOpen = true;
      this.extractionTimer = this.mission?.extractionTimer || 60000;
      this.missionStatus = MissionStatus.EXTRACTION;
      this.alertLevel = Math.min(CFG.mission.maxAlertLevel, this.alertLevel + 0.3);

      if (this._onObjectiveUpdate) {
        this._onObjectiveUpdate({ type: 'extraction_open', timer: this.extractionTimer });
      }
    }
  }

  _updateMission(dt) {
    if (this.missionStatus === MissionStatus.DROP_IN) return;

    // Update alert level growth
    if (this.missionStatus === MissionStatus.ACTIVE) {
      this.alertLevel = Math.min(
        CFG.mission.maxAlertLevel,
        this.alertLevel + this.mission.alertGrowth
      );
    }

    // Check terminal/beacon objectives (hold to complete)
    for (const id in this.objectives) {
      const obj = this.objectives[id];
      if (obj.status !== ObjectiveStatus.PENDING && obj.status !== ObjectiveStatus.IN_PROGRESS) continue;

      if (obj.type === ObjectiveType.ACTIVATE_TERMINAL) {
        const dist = Math.hypot(this.player.x - obj.x, this.player.y - obj.y);
        if (dist < obj.config.radius) {
          obj.status = ObjectiveStatus.IN_PROGRESS;
          obj.progress += this._tickMs;
          if (obj.progress >= obj.config.holdTime) {
            obj.status = ObjectiveStatus.COMPLETED;
            this.player.score += obj.config.completionReward;
            this._checkPrimaryObjectives();
          }
        }
      }
    }

    // Check extraction
    if (this.extractionOpen) {
      this.extractionTimer -= this._tickMs;

      const extractZone = this.mission?.extractZone;
      if (extractZone) {
        const dist = Math.hypot(this.player.x - extractZone.x, this.player.y - extractZone.y);
        const radius = OBJECTIVE_CONFIG[ObjectiveType.EXTRACT].radius;

        if (dist < radius) {
          this.extractionProgress += this._tickMs;
          if (this.extractionProgress >= CFG.mission.extractHoldTime) {
            this._missionComplete();
            return;
          }
        } else {
          this.extractionProgress = Math.max(0, this.extractionProgress - this._tickMs * 0.5);
        }
      }

      // Time ran out
      if (this.extractionTimer <= 0) {
        this._gameOver = true;
        this.missionStatus = MissionStatus.FAILED;
        if (this._onGameOver) {
          this._onGameOver({
            score: this.player.score,
            wave: 0,
            missionStatus: MissionStatus.FAILED
          });
        }
      }
    }
  }

  _missionComplete() {
    this._gameOver = true;
    this.missionStatus = MissionStatus.COMPLETED;

    // Bonus for optional objectives
    const optionals = Object.values(this.objectives).filter(o => !o.isPrimary && o.status === ObjectiveStatus.COMPLETED);
    this.player.score += optionals.length * 100;

    // Extraction bonus
    this.player.score += OBJECTIVE_CONFIG[ObjectiveType.EXTRACT].completionReward;

    if (this._onMissionComplete) {
      this._onMissionComplete({
        score: this.player.score,
        missionId: this.missionId,
        objectives: Object.values(this.objectives)
      });
    }
  }

  _checkWaveProgress() {
    if (this._gameOver || this.missionMode) return;
    const aliveCount = Object.values(this.enemies).filter(e => e.alive).length;
    if (this._enemiesRemaining <= 0 && aliveCount === 0) {
      this._startWave(this.wave + 1);
    }
  }
}
