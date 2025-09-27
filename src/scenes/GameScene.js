/**
 * GameScene — the heartbeat of the arcade loop:
 * - Spawns waves of enemies that chase the player
 * - Handles player input (WASD + mouse aim/shoot)
 * - Calculates collisions/damage
 * - Emits score events the UI listens to
 */

import { CFG } from '../core/Config.js';
import { events } from '../core/Events.js';
import AnimController from '../systems/AnimController.js';
import { Health } from '../systems/Health.js';

export default class GameScene extends Phaser.Scene {
  constructor(){ super('Game'); }

  create(data){
    this.profile = data.profile;
    this.score = 0;
    this.gameOver = false;

    // groups
    this.bullets = this.physics.add.group();
    this.enemies = this.physics.add.group();

    // ─── PLAYER ────────────────────────────────────────────────────────────────
    this.player = this.physics.add.sprite(160, 90, 'p_idle_front', 0).setScale(1);
    this.player.setCollideWorldBounds(true);
    // attach health with onDeath callback
    Health.attach(this.player, {
      max: CFG.player.hp,
      onDeath: () => this.finish()
    });

    // small, visible damage feedback tint duration
    this.playerHitTint = 0x9999ff;

    // player anim controller
    this.pAnim = new AnimController(this.player, {
      idle_front: 'p_idle_front',
      idle_back:  'p_idle_back',
      walk_front: 'p_walk_front',
      walk_back:  'p_walk_back'
    });

    // input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D');

    // collisions
    this.physics.add.overlap(this.bullets, this.enemies, this.onBulletHitsEnemy, null, this);

    // NEW: enemy → player touch damage
    this.physics.add.overlap(this.player, this.enemies, this.onEnemyTouchesPlayer, null, this);

    // spawn loop
    this.wave = 1;
    this.time.addEvent({ delay: 3000, loop: false, callback: () => this.spawnWave() });

    // camera
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    // Expand world bounds so ENVELOP doesn't clip movement off-screen
    const w = this.scale.width, h = this.scale.height;
    this.physics.world.setBounds(-w, -h, w*3, h*3);
  }

  update(time, delta){
    if (this.gameOver) return;

    // --- Read shared mobile input ---
    const shared = this.registry.get('input') || { vector:{x:0,y:0}, autoFire:false, aim:null };

    // Keyboard vector (desktop support)
    const kx = (this.keys.A?.isDown?-1:0) + (this.keys.D?.isDown?1:0);
    const ky = (this.keys.W?.isDown?-1:0) + (this.keys.S?.isDown?1:0);
    const kv = new Phaser.Math.Vector2(kx, ky);

    // Touch vector
    const tv = new Phaser.Math.Vector2(shared.vector.x, shared.vector.y);

    // Prefer the stronger magnitude
    const useTouch = tv.lengthSq() > kv.lengthSq();
    const dir = useTouch ? tv : kv.normalize();

    // Move player
    const speed = CFG.player.speed;
    this.player.setVelocity(dir.x * speed, dir.y * speed);

    // ----- Aim selection -----
    let ang;
    if (shared.aim) {
      // If a second finger is down, aim there
      ang = Phaser.Math.Angle.Between(this.player.x, this.player.y, shared.aim.x, shared.aim.y);
    } else if (useTouch && dir.lengthSq() > 0.0001) {
      // No aim touch → aim where you’re moving (good 1-thumb fallback)
      ang = Math.atan2(dir.y, dir.x);
    } else {
      // Desktop or idle touch → use pointer/mouse
      const p = this.input.activePointer;
      ang = Phaser.Math.Angle.Between(this.player.x, this.player.y, p.worldX, p.worldY);
    }

    // Animate (no sprite rotation)
    this.pAnim.updateFromVelocity(this.player.body.velocity.x, this.player.body.velocity.y);

    // ----- Fire rule -----
    const wantsShoot =
      shared.autoFire                  // mobile/touch: always auto-fire
      || this.input.activePointer.isDown; // desktop mouse

    if (wantsShoot && (this._lastFired ?? 0) < time - CFG.player.fireCooldownMs){
      this._lastFired = time;

      const b = this.bullets.create(this.player.x, this.player.y, 'bullet', 0);
      b.setAngle(Phaser.Math.RadToDeg(ang));
      this.physics.velocityFromRotation(ang, CFG.bullet.speed, b.body.velocity);
      b.damage = CFG.bullet.damage;
      this.time.delayedCall(CFG.bullet.ttlMs, () => b?.destroy());
    }

    // --- Enemy seek (unchanged) ---
    this.enemies.children.iterate(e => {
      if (!e) return;
      const ea = Phaser.Math.Angle.Between(e.x, e.y, this.player.x, this.player.y);
      this.physics.velocityFromRotation(ea, e.speed, e.body.velocity);
      e._anim?.updateFromVelocity(e.body.velocity.x, e.body.velocity.y);
    });
}

  spawnWave(){
    const count = 1 + this.wave;

    for (let i = 0; i < count; i++){
      const e = this.enemies.create(
        Phaser.Math.Between(this.scale.width, this.scale.width + this.scale.width/3),
        Phaser.Math.Between(this.scale.height, this.scale.height + this.scale.height/3),
        'e_walk_front', 0
      ).setScale(0.6);

      e.speed  = CFG.enemy.baseSpeed + this.wave * 2;
      e.damage = 1;

      // attach health to enemy; on death: score, shake, destroy
      Health.attach(e, {
        max: Math.ceil(CFG.enemy.baseHP * (1 + this.wave*0.2)),
        onDeath: () => {
          // this.cameras.main.shake(40, 0.002);
          this.score += 10;
          events.emit('score:add', 10);
          e.destroy();
        }
      });

      // enemy anim controller (front-only for now)
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


  onBulletHitsEnemy(bullet, enemy){
    // damage enemy; no i-frames for bugs
     const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, bullet.x, bullet.y);
      if (dist < 38) {
        bullet.destroy();
        // (death is handled by enemy's onDeath callback inside Health.attach)
        Health.damage(enemy, bullet.damage ?? 1, this);
       
      }
  }

  // ─── Enemy touches player → damage with i-frames ────────────────────────────
  onEnemyTouchesPlayer(player, enemy){
    // Use i-frames to avoid melting the player instantly on overlap
    const hp = Health.damage(player, enemy.damage ?? 1, this, { iFramesMs: CFG.player.iFramesMs });

    // visual feedback
    player.setTint(this.playerHitTint);
    this.cameras.main.shake(60, 0.004);
    this.time.delayedCall(CFG.player.iFramesMs, () => player.clearTint());

    // optional: trigger enemy attack animation once when close
    if (!enemy._attacking) {
      const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, player.x, player.y);
      if (dist < 38) {
        enemy._attacking = true;
        enemy.setVelocity(0, 0);
        enemy._anim?.playAttack('front', 'e_attack_front');
        enemy.once('animationcomplete-e_attack_front', () => {
          enemy._attacking = false;
          enemy.anims.play('e_walk_front', true);
        });
      }
    }

    // if hp <= 0, Health.onDeath for player will have called finish()
  }

  finish(){
    if (this.gameOver) return;
    this.gameOver = true;
    this.scene.stop('UI');
    this.scene.start('GameOver', { score: this.score, wave: this.wave-1, profile: this.profile });
  }
}