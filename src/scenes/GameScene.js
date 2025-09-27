/**
 * GameScene — the heartbeat of the arcade loop:
 * - Spawns waves of enemies that chase the player
 * - Handles player input (WASD + mouse aim/shoot)
 * - Calculates collisions/damage
 * - Emits score events the UI listens to
 */

// src/scenes/GameScene.js
// WHAT: Desktop uses FIT-like camera zoom; mobile portrait uses the 20px-player + min-width portrait zoom.
// WHY: Desktop looks like your original layout; mobile shows more vertical without tiny sprites.

import { CFG } from '../core/Config.js';
import { events } from '../core/Events.js';
import AnimController from '../systems/AnimController.js';
import {
  computePortraitZoom,
  computeDesktopZoom,
  lerpZoom
} from '../systems/PortraitZoom.js';
import { isDesktopLike } from '../utils/DeviceMode.js';

export default class GameScene extends Phaser.Scene {
  constructor(){ super('Game'); }

  create(data){
    // ── Session/score state
    this.profile = data?.profile || { displayName: 'Ranger' };
    this.score = 0;
    this.gameOver = false;

    // ── Groups
    this.bullets = this.physics.add.group();
    this.enemies = this.physics.add.group();

    // ── Player sprite + basic setup
    this.player = this.physics.add.sprite(160, 90, 'p_idle_front', 0).setScale(1);
    this.player.setCollideWorldBounds(true);

    // ── Anim controller (front/back walk/idle)
    this.pAnim = new AnimController(this.player, {
      idle_front: 'p_idle_front',
      idle_back:  'p_idle_back',
      walk_front: 'p_walk_front',
      walk_back:  'p_walk_back'
    });

    // ── Desktop keyboard fallback
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D');

    // ── Collisions
    this.physics.add.overlap(this.bullets, this.enemies, this.onBulletHitsEnemy, null, this);
    this.physics.add.overlap(this.player,  this.enemies, this.onEnemyTouchesPlayer, null, this);

    // ── Camera follow + generous world bounds (so RESIZE + follow stays comfy)
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    const w = this.scale.width, h = this.scale.height;
    this.physics.world.setBounds(-w, -h, w*3, h*3);

    // ── Zoom policy config (desktop vs portrait)
    this._zoomCfg = {
      BASE_W: 480,           // desktop design width (emulate FIT)
      BASE_H: 270,           // desktop design height
      PLAYER_FRAME_H: 24,    // player sprite frame height (world px)
      TARGET_PLAYER_PX: 20,  // desired player size on mobile (screen px)
      MIN_WORLD_WIDTH: 240,  // ensure portrait shows at least this much width
      Z_MIN: 0.75,           // clamp lower bound
      Z_MAX: 1.0,            // clamp upper bound
      LERP: 0.15             // smooth factor each frame
    };

    // ── Targeting + auto-aim config (one source of truth; no duplicates)
    this._targetCfg = {
      ENGAGE_RADIUS: 220,          // auto-fire only if enemy within this radius
      RETARGET_INTERVAL_MS: 250,   // reconsider target every X ms
      STICKY_BIAS: 0.9             // new target must be ~10% closer to steal lock
    };
    this._target = { sprite: null, nextCheckAt: 0, lastDist: Infinity };

    // ── Tap handling: one-shot intent passed from UIScene via events
    this._tapPending = null; // {x,y} consumed next frame
    events.on('aim:tap', (pt) => { this._tapPending = pt; });

    // ── Re-apply zoom when viewport changes
    this.scale.on('resize', () => this._applyZoom(true));
    this._applyZoom(true);

    // ── Simple enemy spawner (keep your own if you already have one)
    this.wave = 1;
    this.time.addEvent({ delay: 1500, loop: true, callback: () => this.spawnWave() });
  }

  // WHAT: Apply desktop vs mobile (portrait) zoom.
  // WHY: Desktop emulates FIT; portrait uses "player≈20px + min width" bias.
  _applyZoom(jump=false){
    const cam = this.cameras.main;
    const vw = this.scale.width, vh = this.scale.height;

    let targetZoom;
    if (isDesktopLike(vw, vh)) {
      targetZoom = computeDesktopZoom({
        viewW: vw, viewH: vh,
        baseW: this._zoomCfg.BASE_W,
        baseH: this._zoomCfg.BASE_H
      });
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

    if (jump) cam.setZoom(targetZoom);
    else      lerpZoom(cam, targetZoom, this._zoomCfg.LERP);
  }

  update(time, delta){
    if (this.gameOver) return;

    // ── Smooth zoom every frame (handles orientation/resize gracefully)
    this._applyZoom(false);

    // ── Read movement + aim state published by UIScene (D-pad + aim layer)
    const state = this.registry.get('input') || { vector:{x:0,y:0}, aimHeld:false, aim:null };

    // Movement vector: prefer D-pad over keyboard if it has stronger magnitude
    const kx = (this.keys.A?.isDown?-1:0) + (this.keys.D?.isDown?1:0);
    const ky = (this.keys.W?.isDown?-1:0) + (this.keys.S?.isDown?1:0);
    const kv = new Phaser.Math.Vector2(kx, ky);
    const tv = new Phaser.Math.Vector2(state.vector.x, state.vector.y);
    const dir = (tv.lengthSq() > kv.lengthSq()) ? tv : kv.normalize();

    // Apply movement
    this.player.setVelocity(dir.x * CFG.player.speed, dir.y * CFG.player.speed);

    // Animate (no sprite rotation — only bullets rotate)
    this.pAnim.updateFromVelocity(this.player.body.velocity.x, this.player.body.velocity.y);

    // ── Aim + fire gate (priority: TAP one-shot → HOLD stream → AUTO fallback)
    let wantsShoot = false;
    let ang = 0;

    // 1) TAP = single shot toward the tap point (consumed once)
    if (this._tapPending) {
      const pt = this._tapPending;
      ang = Phaser.Math.Angle.Between(this.player.x, this.player.y, pt.x, pt.y);
      wantsShoot = true;
      this._tapPending = null; // consume
    }
    // 2) HOLD = continuous stream while finger is down (manual aim has no radius check)
    else if (state.aimHeld && state.aim) {
      ang = Phaser.Math.Angle.Between(this.player.x, this.player.y, state.aim.x, state.aim.y);
      wantsShoot = true;
    }
    // 3) AUTO = only if a target exists within radius
    else {
      const tgt = this._acquireTarget(time);
      if (tgt) {
        ang = Phaser.Math.Angle.Between(this.player.x, this.player.y, tgt.x, tgt.y);
        wantsShoot = true;
      }
    }

    // Fire once per cooldown if allowed
    if (wantsShoot && (this._lastFired ?? 0) < time - CFG.player.fireCooldownMs){
      this._lastFired = time;

      const b = this.bullets.create(this.player.x, this.player.y, 'bullet', 0);
      b.setAngle(Phaser.Math.RadToDeg(ang));
      this.physics.velocityFromRotation(ang, CFG.bullet.speed, b.body.velocity);
      b.damage = CFG.bullet.damage;
      this.time.delayedCall(CFG.bullet.ttlMs, () => b?.destroy());
    }

    // ── Enemy seek + anim (placeholder AI)
    this.enemies.children.iterate(e => {
      if (!e) return;
      const ea = Phaser.Math.Angle.Between(e.x, e.y, this.player.x, this.player.y);
      this.physics.velocityFromRotation(ea, e.speed, e.body.velocity);
      e._anim?.updateFromVelocity(e.body.velocity.x, e.body.velocity.y);
    });
  }

  // WHAT: Choose closest enemy in radius with a little stickiness.
  // WHY: Prevent aim flicker when two targets are similar distance.
  _acquireTarget(nowMs){
    const { ENGAGE_RADIUS, RETARGET_INTERVAL_MS, STICKY_BIAS } = this._targetCfg;

    // Keep current target until next check window expires
    if (nowMs < this._target.nextCheckAt && this._target.sprite?.active) {
      const s = this._target.sprite;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, s.x, s.y);
      if (d <= ENGAGE_RADIUS) return s;
    }

    // Find nearest within radius
    let best = null, bestD = Infinity;
    this.enemies.children.iterate(e => {
      if (!e || !e.active) return;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y);
      if (d <= ENGAGE_RADIUS && d < bestD) { best = e; bestD = d; }
    });

    // Stickiness: only switch if significantly closer
    const cur = this._target.sprite;
    if (cur && cur.active) {
      const curD = Phaser.Math.Distance.Between(this.player.x, this.player.y, cur.x, cur.y);
      const steal = best && (bestD < curD * STICKY_BIAS);
      if (!best || !steal) {
        if (curD <= ENGAGE_RADIUS) {
          this._target.nextCheckAt = nowMs + RETARGET_INTERVAL_MS;
          this._target.lastDist = curD;
          return cur;
        }
      }
    }

    // Accept new (or none)
    this._target.sprite = best || null;
    this._target.lastDist = bestD;
    this._target.nextCheckAt = nowMs + RETARGET_INTERVAL_MS;
    return this._target.sprite;
  }

  // ── Bullet→Enemy (replace with Health.damage if you’ve wired it)
  onBulletHitsEnemy(bullet, enemy){
    bullet.destroy();
    // If you have Health: Health.damage(enemy, bullet.damage ?? 1, this);
    enemy.destroy(); // placeholder
    this.score += 10;
    events.emit('score:add', 10);
  }

  // ── Enemy→Player touch (wire your Health/i-frames if available)
  onEnemyTouchesPlayer(player, enemy){
    this.cameras.main.shake(50, 0.003);
    // If Health present: Health.damage(player, enemy.damage ?? 1, this, { iFramesMs: ... });
  }

  // ── Simple wave spawner (replace with your own if you already have one)
  spawnWave(){
    const count = 2
    //  + this.wave;
    for (let i=0;i<count;i++){
      const e = this.enemies.create(
        Phaser.Math.Between(-200, 200) + this.player.x,
        Phaser.Math.Between(-140, 140) + this.player.y,
        'e_walk_front', 0
      ).setScale(0.6);
      e.speed = (CFG.enemy?.baseSpeed ?? 40) + this.wave * 2;

      e._anim = new AnimController(e, {
        idle_front: 'e_walk_front',
        idle_back:  'e_walk_front',
        walk_front: 'e_walk_front',
        walk_back:  'e_walk_front',
        attack_front: 'e_attack_front'
      }, { deadZone: 2 });
      e.anims.play('e_walk_front', true);
    }
    this.wave++;
  }
}
