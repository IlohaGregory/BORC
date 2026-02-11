import Phaser from 'phaser';
import NetSync from '../systems/NetSync.js';
import LocalGameLoop from '../systems/LocalGameLoop.js';
import { networkService } from '../services/NetworkService.js';
import { profileService } from '../services/ProfileService.js';
import AnimController from '../systems/AnimController.js';
import { CFG, EnemyType } from '../core/Config.js';
import { MissionStatus, ObjectiveStatus, OBJECTIVE_CONFIG, ObjectiveType } from '../../../shared/missions.js';
import { TargetPriority, PRIORITY_ORDER } from '../../../shared/targeting.js';
import { isDesktopLike } from '../utils/DeviceMode.js';
import { computePortraitZoom, computeDesktopZoom, lerpZoom } from '../systems/PortraitZoom.js';

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
    this.otherPlayers = {};
    this.enemySprites = {};
    this.enemyAnimState = {};
    this.bulletSprites = {};
    this.projectileSprites = {};
    this.nestSprites = {};
    this.objectiveMarkers = {};
    this._zoomCfg = { BASE_W: 480, BASE_H: 270, PLAYER_FRAME_H: 24, TARGET_PLAYER_PX: 20, MIN_WORLD_WIDTH: 240, Z_MIN: 0.5, Z_MAX: 1.0, LERP: 0.12 };
    this.localPlayerKey = null;
    this.latestState = null;
    this.otherPlayersPool = null;
    this.enemyPool = null;
    this.bulletPool = null;
    this.mode = 'multiplayer';
    this.gameLoop = null;
    this.netSync = null;
    this.missionId = null;

    // Combat state
    this.targetPriority = TargetPriority.CLOSEST;
    this.focusTargetId = null;
    this.currentTarget = null;
    this.focusIndicator = null;
  }

  init(data) {
    this.mode = data?.mode || 'multiplayer';
    this.joinRoomId = data?.joinRoomId || null;
    this.profile = data?.profile || { displayName: 'Pilot' };
    this.missionId = data?.missionId || null;
    this.difficulty = data?.difficulty || null; // NEW: Difficulty-based procedural generation
  }

  async create() {
    // Get map dimensions from mission or defaults
    const mapW = this.gameLoop?.mapWidth || CFG.mission.defaultMapWidth;
    const mapH = this.gameLoop?.mapHeight || CFG.mission.defaultMapHeight;

    this.scoreText = this.add.text(6, 6, 'Score: 0', { fontFamily: 'monospace', fontSize: 12, color: '#fff' }).setScrollFactor(0).setDepth(100);

    // Mission status text
    this.missionText = this.add.text(6, 22, '', { fontFamily: 'monospace', fontSize: 10, color: '#4d73fd' }).setScrollFactor(0).setDepth(100);

    // Alert level indicator
    this.alertBar = this.add.graphics().setScrollFactor(0).setDepth(100);

    // Extraction timer
    this.extractText = this.add.text(this.scale.width / 2, 6, '', { fontFamily: 'monospace', fontSize: 14, color: '#ff4444' }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(100);

    this.player = this.physics.add.sprite(160, 90, 'p_idle_front', 0).setDepth(2).setOrigin(0.5);
    this.player.setCollideWorldBounds(true);
    this.pAnim = new AnimController(this.player, {
      idle_front: 'p_idle_front',
      idle_back: 'p_idle_back',
      walk_front: 'p_walk_front',
      walk_back: 'p_walk_back'
    });

    this.keys = this.input.keyboard.addKeys({
      W: Phaser.Input.Keyboard.KeyCodes.W,
      A: Phaser.Input.Keyboard.KeyCodes.A,
      S: Phaser.Input.Keyboard.KeyCodes.S,
      D: Phaser.Input.Keyboard.KeyCodes.D
    });
    this.cursors = this.input.keyboard.createCursorKeys();

    this.cameras.main.startFollow(this.player, true, CFG.camera.followLerp, CFG.camera.followLerp);
    this.physics.world.setBounds(-50, -50, mapW + 100, mapH + 100);
    this._applyZoom(true);
    this._resizeHandler = () => this._applyZoom(true);
    this.scale.on('resize', this._resizeHandler);

    // Create pools
    this.otherPlayersPool = this.add.group({ classType: Phaser.GameObjects.Sprite, maxSize: 10 });
    this.enemyPool = this.add.group({ classType: Phaser.GameObjects.Sprite, maxSize: 100 });
    this.bulletPool = this.add.group({ classType: Phaser.GameObjects.Sprite, maxSize: 100 });
    this.projectilePool = this.add.group({ classType: Phaser.GameObjects.Sprite, maxSize: 50 });
    this.nestPool = this.add.group({ classType: Phaser.GameObjects.Sprite, maxSize: 10 });

    // Clear any stale sprites from pools
    this.enemySprites = {};
    this.enemyAnimState = {};
    this.enemyPool.clear(true, true);

    // Focus indicator graphics
    this.focusIndicator = this.add.graphics().setDepth(10);

    // Extraction zone graphics
    this.extractZoneGraphics = this.add.graphics().setDepth(0);

    // Set up tap-to-focus
    this._setupTapFocus();

    if (this.mode === 'solo') {
      await this._createSolo();
    } else {
      await this._createMultiplayer();
    }

    this._lastRenderAt = Date.now();
    this.scene.launch('UI', { profile: this.profile, missionMode: !!this.missionId });
  }

  _setupTapFocus() {
    this.input.on('pointerdown', (pointer) => {
      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const tappedEnemy = this._findEnemyAtPoint(worldPoint.x, worldPoint.y);

      if (tappedEnemy) {
        this.focusTargetId = tappedEnemy.id;
        if (this.gameLoop) {
          this.gameLoop.setFocusTarget(tappedEnemy.id);
        }
        if (this.mode === 'multiplayer' && networkService.gameRoom) {
          networkService.gameRoom.send('setFocus', { targetId: tappedEnemy.id });
        }
      } else {
        this.focusTargetId = null;
        if (this.gameLoop) {
          this.gameLoop.clearFocusTarget();
        }
        if (this.mode === 'multiplayer' && networkService.gameRoom) {
          networkService.gameRoom.send('setFocus', { targetId: '' });
        }
      }
    });
  }

  _findEnemyAtPoint(x, y) {
    const tapRadius = 25;
    for (const [id, sprite] of Object.entries(this.enemySprites)) {
      if (!sprite || !sprite.active) continue;
      const dist = Math.hypot(sprite.x - x, sprite.y - y);
      if (dist <= tapRadius) {
        return { id, x: sprite.x, y: sprite.y };
      }
    }
    return null;
  }

  cyclePriority() {
    const idx = PRIORITY_ORDER.indexOf(this.targetPriority);
    const nextIdx = (idx + 1) % PRIORITY_ORDER.length;
    this.targetPriority = PRIORITY_ORDER[nextIdx];

    if (this.gameLoop) {
      this.gameLoop.setTargetPriority(this.targetPriority);
    }
    if (this.mode === 'multiplayer' && networkService.gameRoom) {
      networkService.gameRoom.send('setPriority', { priority: this.targetPriority });
    }

    return this.targetPriority;
  }

  async _createSolo() {
    this.localPlayerKey = 'local';
    // Pass both missionId (legacy) and difficulty (new procedural) to LocalGameLoop
    this.gameLoop = new LocalGameLoop(this, this.missionId, this.difficulty);

    // Update map bounds based on mission
    const mapW = this.gameLoop.mapWidth;
    const mapH = this.gameLoop.mapHeight;
    this.physics.world.setBounds(-50, -50, mapW + 100, mapH + 100);

    // Position player at drop zone
    if (this.gameLoop.mission?.dropZone) {
      this.player.x = this.gameLoop.mission.dropZone.x;
      this.player.y = this.gameLoop.mission.dropZone.y;
    }

    this.gameLoop.onGameOver(({ score, wave, missionStatus }) => {
      this.sound.play('player_death');
      this.gameLoop.stop();
      this.scene.stop('UI');
      const profile = profileService.load() || this.profile;
      this.scene.start('GameOver', {
        score,
        wave,
        mode: 'solo',
        profile,
        missionId: this.missionId,
        missionStatus
      });
    });

    this.gameLoop.onMissionComplete(({ score, missionId, objectives }) => {
      this.gameLoop.stop();
      this.scene.stop('UI');
      const profile = profileService.load() || this.profile;
      this.scene.start('GameOver', {
        score,
        wave: 0,
        mode: 'solo',
        profile,
        missionId,
        missionStatus: MissionStatus.COMPLETED,
        objectives
      });
    });

    this.gameLoop.onObjectiveUpdate((obj) => {
      // Could trigger UI notification here
      console.log('[GameScene] objective update:', obj);
    });

    this.gameLoop.start();
  }

  async _createMultiplayer() {
    try {
      await networkService.joinRoom(this.joinRoomId, { missionId: this.missionId });
    } catch (e) {
      this.time.delayedCall(1000, () => this.scene.start('WaitingRoom', { walletConnected: true }));
      return;
    }

    this.localPlayerKey = networkService.playerKey || networkService.sessionId || null;

    this.netSync = new NetSync(networkService, this, { interpMs: 200 });
    await this.netSync.start();

    // Throttle input sending at ~30Hz
    this.time.addEvent({ delay: 33, callback: this._updateLocalInputRegistry, callbackScope: this, loop: true });

    // Listen for server messages
    if (networkService.gameRoom) {
      networkService.gameRoom.onMessage('gameover', (data) => {
        this.sound.play('player_death');
        this.netSync?.stop();
        this.scene.stop('UI');
        const myScore = data.scores?.[this.localPlayerKey] || 0;
        this.scene.start('GameOver', { score: myScore, wave: 0, mode: 'multiplayer', profile: this.profile });
      });

      networkService.gameRoom.onMessage('mission_complete', (data) => {
        this.netSync?.stop();
        this.scene.stop('UI');
        const myScore = data.scores?.[this.localPlayerKey] || 0;
        this.scene.start('GameOver', {
          score: myScore,
          wave: 0,
          mode: 'multiplayer',
          profile: this.profile,
          missionId: data.missionId,
          missionStatus: MissionStatus.COMPLETED
        });
      });


      networkService.gameRoom.onMessage('mission_failed', (data) => {
        this.netSync?.stop();
        this.scene.stop('UI');
        const myScore = data.scores?.[this.localPlayerKey] || 0;
        this.scene.start('GameOver', {
          score: myScore,
          wave: 0,
          mode: 'multiplayer',
          profile: this.profile,
          missionStatus: MissionStatus.FAILED
        });
      });

      networkService.gameRoom.onMessage('extraction_open', (data) => {
        // Could trigger extraction notification
        console.log('[GameScene] extraction_open:', data);
      });
    }
  }

  _applyZoom(jump = false) {
    const cam = this.cameras.main;
    if (!cam) return;
    const vw = this.scale.width, vh = this.scale.height;
    let targetZoom = CFG.camera.zoomBase;

    try {
      if (isDesktopLike(vw, vh)) {
        targetZoom = computeDesktopZoom({ viewW: vw, viewH: vh, baseW: this._zoomCfg.BASE_W, baseH: this._zoomCfg.BASE_H });
      } else {
        targetZoom = computePortraitZoom({
          viewW: vw, viewH: vh,
          playerFrameH: this._zoomCfg.PLAYER_FRAME_H,
          TARGET_PLAYER_PX: this._zoomCfg.TARGET_PLAYER_PX,
          MIN_WORLD_WIDTH: this._zoomCfg.MIN_WORLD_WIDTH,
          Z_MIN: this._zoomCfg.Z_MIN,
          Z_MAX: this._zoomCfg.Z_MAX
        });
      }

      // Zoom out more for mission maps (larger maps)
      if (this.missionId || this.gameLoop?.missionMode) {
        targetZoom *= 0.85;
      }

      targetZoom = Math.max(CFG.camera.zoomMin, Math.min(CFG.camera.zoomMax, targetZoom));
    } catch (e) {
      targetZoom = CFG.camera.zoomBase;
    }

    if (jump) cam.setZoom(targetZoom);
    else lerpZoom(cam, targetZoom, this._zoomCfg.LERP);
  }

  update(time, delta) {
    if (this.pAnim && this.player?.body) {
      this.pAnim.updateFromVelocity(this.player.body.velocity.x, this.player.body.velocity.y);
    }

    if (this.mode === 'solo') {
      this._renderSoloState();
    } else if (this.netSync) {
      this._renderMultiplayerState(delta);
    }

    this._updateFocusIndicator();
  }

  _updateFocusIndicator() {
    this.focusIndicator.clear();

    let target = null;

    // Find focused enemy sprite
    if (this.focusTargetId && this.enemySprites[this.focusTargetId]) {
      const sprite = this.enemySprites[this.focusTargetId];
      if (sprite.active) {
        target = { x: sprite.x, y: sprite.y, focused: true };
      }
    }

    if (!target) {
      this.currentTarget = null;
      return;
    }

    this.currentTarget = target;

    // Draw targeting ring
    const radius = 15;
    const color = target.focused ? 0xff4444 : 0xffff44;

    this.focusIndicator.lineStyle(2, color, 0.8);
    this.focusIndicator.strokeCircle(target.x, target.y, radius);

    // Draw crosshair on focused target
    if (target.focused) {
      const crossSize = 8;
      this.focusIndicator.lineStyle(1, 0xff4444, 0.6);
      this.focusIndicator.beginPath();
      this.focusIndicator.moveTo(target.x - crossSize, target.y);
      this.focusIndicator.lineTo(target.x + crossSize, target.y);
      this.focusIndicator.moveTo(target.x, target.y - crossSize);
      this.focusIndicator.lineTo(target.x, target.y + crossSize);
      this.focusIndicator.strokePath();
    }
  }

  _renderSoloState() {
    if (!this.gameLoop) return;
    const state = this.gameLoop.getState();
    const local = state.players.local;

    // Drive player sprite from game loop state
    if (local && this.player) {
      this.player.x = local.x;
      this.player.y = local.y;
      if (this.player.body) {
        this.player.body.setVelocity(this.gameLoop.player.vx, this.gameLoop.player.vy);
      }
      if (this.scoreText) {
        if (this.gameLoop.missionMode) {
          this.scoreText.setText(`Score: ${Math.floor(local.score)}`);
        } else {
          this.scoreText.setText(`Score: ${local.score}  Wave: ${this.gameLoop.wave}`);
        }
      }
    }

    // Mission UI
    this._renderMissionUI(state);

    // Render nests
    this._renderNests(state.nests);

    // Render enemies with type distinction
    this._renderEnemies(state.enemies);

    // Render bullets
    this._renderBullets(state.bullets);

    // Render projectiles
    this._renderProjectiles(state.projectiles);

    // Render extraction zone
    this._renderExtractionZone(state.mission);
  }

  _renderMissionUI(state) {
    const mission = state.mission;
    if (!mission) return;

    // Mission status
    let statusText = '';
    if (mission.status === MissionStatus.DROP_IN) {
      statusText = 'DROPPING IN...';
    } else if (mission.status === MissionStatus.ACTIVE) {
      const objectives = Object.values(state.objectives || {});
      const completed = objectives.filter(o => o.status === ObjectiveStatus.COMPLETED && o.isPrimary).length;
      const total = objectives.filter(o => o.isPrimary).length;
      statusText = `Objectives: ${completed}/${total}`;
    } else if (mission.status === MissionStatus.EXTRACTION) {
      statusText = 'EXTRACT NOW!';
    }
    this.missionText.setText(statusText);

    // Alert bar
    this.alertBar.clear();
    const barWidth = 60;
    const barHeight = 4;
    const barX = 6;
    const barY = 38;
    const alertPct = Math.min(1, mission.alertLevel);

    this.alertBar.fillStyle(0x333333, 0.8);
    this.alertBar.fillRect(barX, barY, barWidth, barHeight);

    const alertColor = alertPct > 0.7 ? 0xff4444 : (alertPct > 0.4 ? 0xffaa44 : 0x44ff44);
    this.alertBar.fillStyle(alertColor, 0.9);
    this.alertBar.fillRect(barX, barY, barWidth * alertPct, barHeight);

    // Extraction timer
    if (mission.extractionOpen && mission.extractionTimer > 0) {
      const seconds = Math.ceil(mission.extractionTimer / 1000);
      this.extractText.setText(`EXTRACT: ${seconds}s`);
      this.extractText.setVisible(true);

      // Progress bar for extraction
      if (mission.extractionProgress > 0) {
        const pct = mission.extractionProgress / CFG.mission.extractHoldTime;
        this.extractText.setText(`EXTRACT: ${seconds}s [${Math.floor(pct * 100)}%]`);
      }
    } else {
      this.extractText.setVisible(false);
    }
  }

  _renderExtractionZone(mission) {
    this.extractZoneGraphics.clear();
    if (!mission?.extractZone || !mission.extractionOpen) return;

    const { x, y } = mission.extractZone;
    const radius = OBJECTIVE_CONFIG[ObjectiveType.EXTRACT]?.radius || 40;

    // Pulsing effect
    const pulse = 0.5 + 0.3 * Math.sin(this.time.now / 300);

    this.extractZoneGraphics.lineStyle(3, 0x44ff44, pulse);
    this.extractZoneGraphics.strokeCircle(x, y, radius);

    // Inner fill
    this.extractZoneGraphics.fillStyle(0x44ff44, 0.15);
    this.extractZoneGraphics.fillCircle(x, y, radius);

    // Label
    if (!this.extractLabel) {
      this.extractLabel = this.add.text(x, y - radius - 10, 'EXTRACT', {
        fontFamily: 'monospace',
        fontSize: 10,
        color: '#44ff44'
      }).setOrigin(0.5).setDepth(5);
    }
    this.extractLabel.setPosition(x, y - radius - 10);
    this.extractLabel.setVisible(true);
  }

  _renderNests(nests) {
    for (const id in nests) {
      const n = nests[id];
      if (!n.alive) {
        if (this.nestSprites[id]) {
          this.nestPool.killAndHide(this.nestSprites[id]);
          delete this.nestSprites[id];
        }
        continue;
      }

      let s = this.nestSprites[id];
      if (!s) {
        s = this.nestPool.get(n.x, n.y);
        if (s) {
          s.setTexture('e_walk_front').setTint(0x8844ff).setScale(1.5).setDepth(1).setOrigin(0.5).setActive(true).setVisible(true);
          this.nestSprites[id] = s;
        }
      } else {
        s.x = n.x;
        s.y = n.y;
      }
    }

    // Remove destroyed nests
    for (const id in this.nestSprites) {
      if (!nests[id] || !nests[id].alive) {
        const s = this.nestSprites[id];
        if (s) this.nestPool.killAndHide(s);
        delete this.nestSprites[id];
      }
    }
  }

  _renderEnemies(enemies) {
    for (const id in enemies) {
      const e = enemies[id];
      if (!e.alive) continue;
      if (e.burrowed) {
        // Hide burrowed enemies
        if (this.enemySprites[id]) {
          this.enemySprites[id].setVisible(false);
        }
        continue;
      }

      let s = this.enemySprites[id];
      if (!s) {
        s = this.enemyPool.get(e.x || 0, e.y || 0);
        if (s) {
          s.setTexture('e_walk_front').setDepth(1).setOrigin(0.5).setActive(true).setVisible(true);
          this.enemySprites[id] = s;
          // Initialize animation state tracking
          this.enemyAnimState[id] = { lastAnim: '', lastX: e.x, lastY: e.y };
        }
      }

      if (s) {
        s.x = e.x;
        s.y = e.y;
        s.setVisible(true);

        // Visual distinction by type
        const scale = this._getEnemyScale(e.type);
        const tint = this._getEnemyTint(e.type);
        s.setScale(scale);
        s.setTint(tint);

        // Animation logic
        const animState = this.enemyAnimState[id];
        if (animState) {
          // Use walk animation for now (attack animation not triggered by server)
          const animKey = 'e_walk_front';

          // Only play animation if it changed (prevents restart flicker)
          if (animKey !== animState.lastAnim) {
            s.anims.play(animKey, true);
            animState.lastAnim = animKey;
          }

          // Flip sprite based on movement direction
          const dx = e.x - animState.lastX;
          if (Math.abs(dx) > 0.1) {
            s.setFlipX(dx < 0);
          }

          // Update last position for next frame
          animState.lastX = e.x;
          animState.lastY = e.y;
        }
      }
    }

    // Recycle missing
    for (const id in this.enemySprites) {
      if (!enemies[id] || !enemies[id].alive) {
        const s = this.enemySprites[id];
        if (s) this.enemyPool.killAndHide(s);
        delete this.enemySprites[id];
        delete this.enemyAnimState[id];
      }
    }
  }

  _getEnemyScale(type) {
    switch (type) {
      case EnemyType.SWARMER: return 0.5;
      case EnemyType.SPITTER: return 0.7;
      case EnemyType.CHARGER: return 1.0;
      case EnemyType.BROOD_MOTHER: return 1.5;
      case EnemyType.BURROWER: return 0.8;
      default: return 0.7;
    }
  }

  _getEnemyTint(type) {
    switch (type) {
      case EnemyType.SWARMER: return 0xffffff;
      case EnemyType.SPITTER: return 0x88ff88;
      case EnemyType.CHARGER: return 0xff8888;
      case EnemyType.BROOD_MOTHER: return 0xff44ff;
      case EnemyType.BURROWER: return 0xaa8844;
      default: return 0xffffff;
    }
  }

  _renderBullets(bullets) {
    for (const id in bullets) {
      const b = bullets[id];
      let s = this.bulletSprites[id];
      if (!s) {
        s = this.bulletPool.get(b.x || 0, b.y || 0);
        if (s) {
          s.setTexture('bullet').setFrame(1).setScale(0.5).setDepth(2).setOrigin(0.5).setActive(true).setVisible(true);
          this.bulletSprites[id] = s;
        }
      } else {
        s.x = b.x;
        s.y = b.y;
      }
      if (s && b.vx !== undefined && b.vy !== undefined) {
        s.rotation = Math.atan2(b.vy, b.vx);
      }
    }

    for (const id in this.bulletSprites) {
      if (!bullets[id]) {
        const s = this.bulletSprites[id];
        if (s) this.bulletPool.killAndHide(s);
        delete this.bulletSprites[id];
      }
    }
  }

  _renderProjectiles(projectiles) {
    if (!projectiles) return;

    for (const id in projectiles) {
      const p = projectiles[id];
      let s = this.projectileSprites[id];
      if (!s) {
        s = this.projectilePool.get(p.x || 0, p.y || 0);
        if (s) {
          s.setTexture('bullet').setFrame(1).setTint(0x88ff44).setScale(0.6).setDepth(2).setOrigin(0.5).setActive(true).setVisible(true);
          this.projectileSprites[id] = s;
        }
      } else {
        s.x = p.x;
        s.y = p.y;
      }
      if (s && p.vx !== undefined && p.vy !== undefined) {
        s.rotation = Math.atan2(p.vy, p.vx);
      }
    }

    for (const id in this.projectileSprites) {
      if (!projectiles[id]) {
        const s = this.projectileSprites[id];
        if (s) this.projectilePool.killAndHide(s);
        delete this.projectileSprites[id];
      }
    }
  }

  _renderMultiplayerState(delta) {
    this.netSync.renderInterpolated(({ players = {}, enemies = {}, bullets = {}, projectiles = {}, nests = {}, objectives = {}, mission = {} }) => {
      const localKey = this.localPlayerKey || networkService.playerKey || networkService.sessionId;

      for (const id in players) {
        const p = players[id] || {};

        if (id === localKey) {
          const blend = 0.3;
          if (this.player) {
            if (typeof p.x === 'number' && typeof p.y === 'number') {
              this.player.x = Phaser.Math.Linear(this.player.x, p.x, blend);
              this.player.y = Phaser.Math.Linear(this.player.y, p.y, blend);
              if (this.scoreText) this.scoreText.setText(`Score: ${Math.floor(p.score || 0)}`);
            }
          }
          continue;
        }

        let ent = this.otherPlayers[id];
        if (!ent) {
          const spr = this.otherPlayersPool.get(p.x || 0, p.y || 0);
          if (spr) {
            spr.setTexture('p_idle_front').setDepth(1).setOrigin(0.5).setScale(1).setActive(true).setVisible(true);
            const anim = new AnimController(spr, { idle_front: 'p_idle_front', idle_back: 'p_idle_back', walk_front: 'p_walk_front', walk_back: 'p_walk_back' });
            ent = { sprite: spr, anim, lastPos: { x: p.x || 0, y: p.y || 0, t: Date.now() } };
            this.otherPlayers[id] = ent;
          }
        } else {
          const now = Date.now();
          const dt = Math.max(1, now - (ent.lastPos.t || now));
          const vx = (p.x - (ent.lastPos.x || p.x)) / (dt / 1000);
          const vy = (p.y - (ent.lastPos.y || p.y)) / (dt / 1000);

          if (typeof p.x === 'number' && typeof p.y === 'number') {
            ent.sprite.x = Phaser.Math.Linear(ent.sprite.x, p.x, 0.6);
            ent.sprite.y = Phaser.Math.Linear(ent.sprite.y, p.y, 0.6);
            ent.sprite.x += vx * (delta / 1000);
            ent.sprite.y += vy * (delta / 1000);
          }

          const speed = Math.hypot(vx, vy);
          if (speed > 5) {
            ent.anim.updateFromVelocity(vx, vy);
          } else {
            ent.anim.updateFromVelocity(0, 0);
          }

          ent.lastPos.x = (typeof p.x === 'number') ? p.x : ent.lastPos.x;
          ent.lastPos.y = (typeof p.y === 'number') ? p.y : ent.lastPos.y;
          ent.lastPos.t = now;
        }
      }

      // Render nests
      this._renderNests(nests);

      // Render enemies
      this._renderEnemies(enemies);

      // Render bullets
      this._renderBullets(bullets);

      // Render projectiles
      this._renderProjectiles(projectiles);

      // Render mission UI
      this._renderMissionUI({ objectives, mission });
      this._renderExtractionZone(mission);

      // Recycle missing entities
      for (const id in this.otherPlayers) {
        if (!players[id]) {
          const ent = this.otherPlayers[id];
          if (ent) {
            this.otherPlayersPool.killAndHide(ent.sprite);
            delete this.otherPlayers[id];
          }
        }
      }
    });
  }

  _updateLocalInputRegistry() {
    const registry = this.registry.get('input') || { vector: { x: 0, y: 0 }, aim: null, aimHeld: false };
    const vx = registry.vector.x;
    const vy = registry.vector.y;

    const keyVX = ((this.keys?.D?.isDown ? 1 : 0) - (this.keys?.A?.isDown ? 1 : 0));
    const keyVY = ((this.keys?.S?.isDown ? 1 : 0) - (this.keys?.W?.isDown ? 1 : 0));
    const finalVX = vx || keyVX;
    const finalVY = vy || keyVY;

    // Local movement prediction
    try {
      const speed = (CFG?.player?.speed || 80);
      const mag = Math.hypot(finalVX, finalVY);
      let localVx = 0, localVy = 0;
      if (mag > 0) {
        localVx = (finalVX / mag) * speed;
        localVy = (finalVY / mag) * speed;
      }
      if (this.player?.body?.setVelocity) {
        this.player.body.setVelocity(localVx, localVy);
      }
    } catch (_) {}

    // Send input to server (multiplayer only, no manual shooting - auto-fire handles it)
    try {
      networkService.sendInput({
        up: !!(finalVY < 0),
        down: !!(finalVY > 0),
        left: !!(finalVX < 0),
        right: !!(finalVX > 0),
        seq: (this._inputSeq = (this._inputSeq || 0) + 1)
      });
    } catch (_) {}
  }

  shutdown() {
    // Stop game systems
    this.gameLoop?.stop();
    this.netSync?.stop();

    // Remove resize listener
    if (this._resizeHandler) {
      this.scale.off('resize', this._resizeHandler);
      this._resizeHandler = null;
    }

    // Remove pointer listener (tap-to-focus)
    this.input.off('pointerdown');

    // Clear pools
    this.otherPlayersPool?.clear(true);
    this.enemyPool?.clear(true);
    this.bulletPool?.clear(true);
    this.projectilePool?.clear(true);
    this.nestPool?.clear(true);

    // Clear sprite references
    this.otherPlayers = {};
    this.enemySprites = {};
    this.bulletSprites = {};
    this.projectileSprites = {};
    this.nestSprites = {};
    this.objectiveMarkers = {};

    // Destroy specific game objects
    if (this.extractLabel) {
      this.extractLabel.destroy();
      this.extractLabel = null;
    }
    if (this.focusIndicator) {
      this.focusIndicator.destroy();
      this.focusIndicator = null;
    }
    if (this.extractZoneGraphics) {
      this.extractZoneGraphics.destroy();
      this.extractZoneGraphics = null;
    }
    if (this.alertBar) {
      this.alertBar.destroy();
      this.alertBar = null;
    }
  }
}
