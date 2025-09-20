/**
 * GameScene — the heartbeat of the arcade loop:
 * - Spawns waves of enemies that chase the player
 * - Handles player input (WASD + mouse aim/shoot)
 * - Calculates collisions/damage
 * - Emits score events the UI listens to
 *
 * NOTE: Everything uses simple shapes for MVP (the 'pixel' texture).
 * When you provide spritesheets, replace 'pixel' with actual keys and add animations.
 */

import { CFG } from '../core/Config.js';
import { events } from '../core/Events.js';
import AnimController from '../systems/AnimController.js';

export default class GameScene extends Phaser.Scene {
  constructor(){ super('Game'); }

  create(data){
    this.profile = data.profile;
    this.score = 0;
    this.gameOver = false;

    // Groups
    this.bullets = this.physics.add.group();
    this.enemies = this.physics.add.group();

    // create player 
    this.player = this.physics.add.sprite(160, 90, 'p_idle_front', 0).setScale(1);
    this.player.hp = CFG.player.hp;
    this.lastFired = 0;

    // Create an animation controller bound to the player
    this.pAnim = new AnimController(this.player, {
      idle_front: 'p_idle_front',
      idle_back:  'p_idle_back',
      walk_front: 'p_walk_front',
      walk_back:  'p_walk_back'
      // (No attack anims for player right now—shooting is a muzzle flash/bullet, not a body anim)
    });

    // Input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D');

    // Collisions
    this.physics.add.overlap(this.bullets, this.enemies, this.onBulletHitsEnemy, null, this);
    this.physics.add.overlap(this.player,  this.enemies, this.onEnemyTouchesPlayer, null, this);

    // Spawn loop
    this.wave = 1;
    this.time.addEvent({ delay: 1500, loop: true, callback: () => this.spawnWave() });

    // Camera
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
  }

  update(time, delta){
    if (this.gameOver) return;

    // Movement (WASD)
    const vx = (this.keys.A.isDown?-1:0) + (this.keys.D.isDown?1:0);
    const vy = (this.keys.W.isDown?-1:0) + (this.keys.S.isDown?1:0);
    const v  = new Phaser.Math.Vector2(vx, vy).normalize().scale(CFG.player.speed);
    this.player.setVelocity(v.x, v.y);

    // Top-down aim toward the mouse (purely cosmetic body rotation for now)
    const p = this.player; const m = this.input.activePointer;
    const ang = Phaser.Math.Angle.Between(p.x, p.y, m.worldX, m.worldY);
    this.player.setRotation(ang);

    // Animate player based on current velocity (front vs back decision happens inside)
    this.pAnim.updateFromVelocity(this.player.body.velocity.x, this.player.body.velocity.y);

    // Shooting (same as before)
    if (m.isDown && time - this.lastFired > CFG.player.fireCooldownMs){
      this.lastFired = time;
      const b = this.bullets.create(p.x, p.y, 'pixel').setScale(1).setTint(0xffffaa);
      this.physics.velocityFromRotation(ang, CFG.bullet.speed, b.body.velocity);
      b.damage = CFG.bullet.damage;
      this.time.delayedCall(CFG.bullet.ttlMs, () => b.destroy());
    }

    // Enemies seek player (we’ll add their anims at spawn time)
    this.enemies.children.iterate(e => {
      if (!e) return;
      const a = Phaser.Math.Angle.Between(e.x, e.y, this.player.x, this.player.y);
      this.physics.velocityFromRotation(a, e.speed, e.body.velocity);

      // Animate enemies as they move. They only have FRONT sheets, so we always use FRONT.
      if (e._anim) e._anim.updateFromVelocity(e.body.velocity.x, e.body.velocity.y);
    });
  }

  spawnWave(){
    const count = 2 + this.wave;

    for (let i=0;i<count;i++){
      // ──────────────────────────────────────────────────────────────────────────
      // ENEMY: use FRONT walk sheet; no back art yet, so we always play "front".
      // We still flipX for left/right so it feels directional.
      // ──────────────────────────────────────────────────────────────────────────
      const e = this.enemies.create(
        Phaser.Math.Between(0, this.scale.width),
        Phaser.Math.Between(0, this.scale.height),
        'e_walk_front', 0
      ).setScale(0.6); // scale down to match player size better (tweak!)

      e.hp     = Math.ceil(CFG.enemy.baseHP * (1 + this.wave*0.2));
      e.speed  = CFG.enemy.baseSpeed + this.wave * 2;
      e.damage = 1;

      // Give enemies their own AnimController. We only supply FRONT keys.
      e._anim = new AnimController(e, {
        idle_front: 'e_walk_front',  // no enemy idle art; reuse walk at low framerate if needed
        idle_back:  'e_walk_front',  // back not available → use front
        walk_front: 'e_walk_front',
        walk_back:  'e_walk_front'   // back not available → use front
      }, { deadZone: 2 });

      // Start walking immediately so they don't pop on first frame
      e.anims.play('e_walk_front', true);
    }

    this.wave++;
  }

  // ... (rest of GameScene unchanged: onBulletHitsEnemy, onEnemyTouchesPlayer, finish)
}
