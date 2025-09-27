/**
 * VirtualDPad — a lightweight, touch-first joystick/D-pad for Phaser 3.
 * Creates a base circle + a draggable thumb and exposes a normalized vector.
 */
// src/ui/VirtualDPad.js
/**
 * VirtualDPad — centered or corner D-pad that returns a normalized movement vector.
 * Adds: bottom-center align, safe no-op when touch not available, public setters.
 */
export default class VirtualDPad {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.size = opts.size ?? 60;
    this.deadFrac = Phaser.Math.Clamp(opts.dead ?? 0.18, 0, 0.8);
    this.alpha = opts.alpha ?? 0.6;
    this.align = opts.align ?? 'bottom-center'; // NEW default
    this.offset = opts.offset ?? { x: 0, y: 84 }; // y=lift from edge, x ignored for center
    this.showOnDesktop = !!opts.showOnDesktop;
    this.force = !!opts.force;

    const input = scene.input;
    const hasPhaserTouch = !!input?.manager?.touch;
    const hasOntouchstart = ('ontouchstart' in window);
    const hasMaxTouch = (navigator.maxTouchPoints ?? 0) > 0;
    const isCoarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    const isTouchCapable = hasPhaserTouch || hasOntouchstart || hasMaxTouch || isCoarse;

    this.enabled = (isTouchCapable || this.showOnDesktop || this.force);
    if (!this.enabled) return;

    scene.input.addPointer(3);

    this.container = scene.add.container(0, 0).setScrollFactor(0).setDepth(9999);
    this.base = scene.add.graphics().setAlpha(this.alpha);
    this.knob = scene.add.graphics().setAlpha(this.alpha);
    this.container.add([this.base, this.knob]);

    // generous hit target
    const hit = scene.add.rectangle(0, 0, this.size * 3.0, this.size * 3.0, 0x000000, 0)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: false })
      .setScrollFactor(0);
    this.container.add(hit);

    this.active = false;
    this.vector = new Phaser.Math.Vector2(0, 0);
    this.maxDist = this.size;
    this.center = new Phaser.Math.Vector2(0, 0);

    hit.on('pointerdown', (p) => this._start(p));
    hit.on('pointermove', (p) => this._move(p));
    hit.on('pointerup',   ()  => this._end());
    hit.on('pointerupoutside', () => this._end());

    this._layout();
    this._draw();
    scene.scale.on('resize', () => this._layout());
  }

  isEnabled() { return !!this.enabled; }
  setVisible(v) { if (this.enabled) this.container?.setVisible(v); }
  setOffset(off) { this.offset = off; this._layout(); }
  setAlign(a) { this.align = a; this._layout(); }
  setSize(r) { this.size = r; this.maxDist = r; this._layout(); this._draw(); }

  _layout() {
    if (!this.enabled || !this.container) return;
    const { width, height } = this.scene.scale;
    let x, y;

    if (this.align === 'bottom-center') {
      x = Math.floor(width / 2);
      y = height - this.offset.y - this.size;
    } else if (this.align === 'bottom-left') {
      x = this.offset.x + this.size;
      y = height - this.offset.y - this.size;
    } else if (this.align === 'bottom-right') {
      x = width - this.offset.x - this.size;
      y = height - this.offset.y - this.size;
    } else {
      x = Math.floor(width / 2);
      y = height - this.offset.y - this.size;
    }

    this.container.setPosition(x, y);
    this.center.set(x, y);
  }

  _draw() {
    if (!this.enabled) return;
    const baseR = this.size;
    const rimR = this.size * 0.85;
    const deadR = this.size * this.deadFrac;

    this.base.clear();
    this.base.lineStyle(2, 0x7ec8e3, 0.9).fillStyle(0x0b0d16, 0.4);
    this.base.beginPath(); this.base.arc(0, 0, baseR, 0, Math.PI * 2);
    this.base.fillPath(); this.base.strokePath();
    this.base.lineStyle(1, 0xffffff, 0.6).strokeCircle(0, 0, rimR);
    this.base.lineStyle(1, 0xffffff, 0.25).strokeCircle(0, 0, deadR);

    this._drawKnob(0, 0);
  }

  _drawKnob(dx, dy) {
    if (!this.enabled) return;
    const r = Math.max(14, this.size * 0.32);
    this.knob.clear();
    this.knob.fillStyle(0xffffff, 0.9).fillCircle(dx, dy, r);
    this.knob.lineStyle(2, 0x7ec8e3, 1).strokeCircle(dx, dy, r);
  }

  _start(p){ if (!this.enabled) return; this.active = true; this._move(p); }

  _move(p){
    if (!this.enabled || !this.active) return;
    const dx = p.worldX - this.center.x;
    const dy = p.worldY - this.center.y;
    const v = new Phaser.Math.Vector2(dx, dy);
    const dist = v.length(), max = this.maxDist;
    if (dist > max) v.scale(max / dist);

    const deadR = this.size * this.deadFrac;
    if (v.length() <= deadR) { this.vector.set(0,0); this._drawKnob(0,0); return; }

    const norm = v.clone().scale(1 / max);
    this.vector.copy(norm);
    this._drawKnob(v.x, v.y);
  }

  _end(){ if (!this.enabled) return; this.active = false; this.vector.set(0,0); this._drawKnob(0,0); }

  getVector(){ return this.enabled ? this.vector : { x:0, y:0 }; }
}
