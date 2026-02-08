// AimTouchZone.js
// Fullscreen transparent touch area that stores a world-space aim point.

import { events } from '../core/Events.js';

export default class AimTouchZone {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ exclude?: () => Array<{x:number,y:number,r:number}>, tapMs?: number }} opts
   */
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.exclude = opts.exclude || (() => []);
    this.TAP_MS = opts.tapMs ?? 180; // <= this ms = tap
    this._aim = new Phaser.Math.Vector2(NaN, NaN);
    this._held = false;
    this._pointerId = null;
    this._downAt = 0;

    const { width, height } = scene.scale;
    this.zone = scene.add.zone(width/2, height/2, width, height)
      .setOrigin(0.5).setScrollFactor(0)
      .setInteractive({ useHandCursor: false });

    this.zone.on('pointerdown', (p) => {
      // Ignore if starting in any exclusion circle (e.g., D-pad)
      const ex = this.exclude();
      for (const c of ex) {
       // Exclude if this tap starts inside the D-pad area (screen coords)
        const dx = p.x - c.x;
        const dy = p.y - c.y;
        if ((dx*dx + dy*dy) <= (c.r * c.r)) return; // ignore aim if inside pad

      }
      if (this._pointerId !== null) return; // already aiming with another finger
      this._pointerId = p.id;
      this._held = true;
      this._downAt = p.event?.timeStamp || performance.now();
      this._update(p);
    });

    this.zone.on('pointermove', (p) => {
      if (!this._held || p.id !== this._pointerId) return;
      this._update(p);
    });

    const finish = (p) => {
      if (p.id !== this._pointerId) return;
      const upAt = p.event?.timeStamp || performance.now();
      const dt = upAt - this._downAt;
      if (dt <= this.TAP_MS) {
        // Fire one shot toward tap point.
        events.emit('aim:tap', { x: this._aim.x, y: this._aim.y });
      }
      this._pointerId = null;
      this._held = false;
      this.clear();
    };

    this.zone.on('pointerup', finish);
    this.zone.on('pointerupoutside', finish);

    this._resizeHandler = (s) => {
      this.zone.setPosition(s.width/2, s.height/2).setSize(s.width, s.height);
    };
    scene.scale.on('resize', this._resizeHandler);
  }

  destroy() {
    if (this._resizeHandler) {
      this.scene.scale.off('resize', this._resizeHandler);
      this._resizeHandler = null;
    }
    if (this.zone) {
      this.zone.destroy();
      this.zone = null;
    }
  }

  _update(p) {
  // Use the GameScene camera to convert screen → world
  const gameScene = this.scene.scene.get('Game');
  if (!gameScene) return;
  const cam = gameScene.cameras.main;
  const pt = cam.getWorldPoint(p.x, p.y);
  this._aim.set(pt.x, pt.y);
}

  clear(){ this._aim.set(NaN, NaN); }
  isHeld(){ return this._held; }
  hasAim(){ return Number.isFinite(this._aim.x) && Number.isFinite(this._aim.y); }
  getAim(){ return this._aim; }
}
