/**
 * AimTouchZone — full-screen transparent input area to read an "aim point".
 * Idea: thumb #1 stays on D-pad; thumb #2 taps/drags anywhere to aim.
 */
export default class AimTouchZone {
  constructor(scene) {
    this.scene = scene;
    this.aim = new Phaser.Math.Vector2(NaN, NaN); // NaN => no aim
    this.down = false;

    const { width, height } = scene.scale;
    this.zone = scene.add.zone(width/2, height/2, width, height)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: false });

    // track
    this.zone.on('pointerdown', (p) => { this.down = true;  this._update(p); });
    this.zone.on('pointermove', (p) => { if (this.down) this._update(p); });
    this.zone.on('pointerup',   ()  => { this.down = false; this.clear(); });
    this.zone.on('pointerupoutside', () => { this.down = false; this.clear(); });

    scene.scale.on('resize', (s) => {
      this.zone.setPosition(s.width/2, s.height/2).setSize(s.width, s.height);
    });
  }

  _update(p) { this.aim.set(p.worldX, p.worldY); }
  clear() { this.aim.set(NaN, NaN); }
  hasAim() { return Number.isFinite(this.aim.x) && Number.isFinite(this.aim.y); }
  getAim() { return this.aim; } // vector in world space
}
