/**
 * AnimController — tiny brain that chooses which animation to play
 * based on the ACTOR'S CURRENT MOVEMENT VECTOR in a top-down game.
 */
import Phaser from "phaser";

export default class AnimController {
  /**
   * @param {Phaser.Physics.Arcade.Sprite} sprite - the sprite to control
   * @param {object} keys - named animation keys to play (see example above)
   * @param {object} [opts]
   * @param {number} [opts.deadZone=4] - velocity magnitude under which we treat as "idle"
   */
  constructor(sprite, keys, opts = {}){
    this.s = sprite;
    this.k = keys;
    this.dead = opts.deadZone ?? 4;  // pixels/sec below which movement is considered "idle"
    this._lastFacing = 'front';      // cache which view we played last ('front'|'back')
    this._lastAnim = '';             // cache last anim key to avoid restarts every frame
    this._locked = false;
  }
  
// Walk animation handler
  updateFromVelocity(vx, vy){

    if(this._locked) return; //if attackin do not update velocity 

    const speed = Math.hypot(vx, vy);

    // Horizontal flip: if vx<0, face left; if vx>0, face right.
    if (vx < -this.dead) this.s.setFlipX(true);
    else if (vx > this.dead) this.s.setFlipX(false);
    // (If |vx| small, we keep previous flip to avoid jitter when stopping)

    // Determine which VIEW (front/back) we should prefer right now
    let view = this._lastFacing; // default to last used view if vy is tiny
    if (vy >  this.dead) view = 'front';
    if (vy < -this.dead) view = 'back';
    this._lastFacing = view;

    // Pick animation by speed: idle_* vs walk_*
    const animKey = speed <= this.dead
      ? (view === 'front' ? this.k.idle_front : this.k.idle_back)
      : (view === 'front' ? this.k.walk_front : this.k.walk_back);

    // Avoid restarting the same animation 60 times/sec (saves perf; prevents pop)
    if (animKey && this._lastAnim !== animKey){
      this.s.anims.play(animKey, true);
      this._lastAnim = 
      animKey;
    }
  }

  /**
   * Force an attack animation (e.g., enemies). Falls back to walk if missing.
   * @param {'front'|'back'} view
   * @param {string|undefined} keyFront
   * @param {string|undefined} keyBack
   */
  playAttack(view = 'front', keyFront, keyBack){
    const k = (view === 'front') ? (keyFront || this.k.attack_front) : (keyBack || this.k.attack_back);
    if (k) {

      this._locked = true;                 // 🔒 freeze auto-anim
      this.s.anims.play(k, true);

      this.s.once(Phaser.Animations.Events.ANIMATION_COMPLETE_KEY + k, () => {
        this._locked = false;
        this._lastAnim = k;
        this._lastFacing = view;
      });
    } else {
      // missing attack anim; gracefully fall back to walking
      this.s.anims.play(view==='front' ? this.k.walk_front : this.k.walk_back, true);
    }
  }
}
