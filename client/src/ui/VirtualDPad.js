// VirtualDPad.js
// D-pad that returns a normalized vector; bottom-center by default.

export default class VirtualDPad {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.size = opts.size ?? 60;
    this.deadFrac = Phaser.Math.Clamp(opts.dead ?? 0.18, 0, 0.8);
    this.alpha = opts.alpha ?? 0.6;
    this.align = 'bottom-center';
    this.offset = opts.offset ?? { x: 0, y: 84 };
    this.force = !!opts.force;
    const touch = !!scene.input?.manager?.touch ||
      'ontouchstart' in window ||
      (navigator.maxTouchPoints ?? 0) > 0 ||
      (window.matchMedia?.('(pointer: coarse)').matches ?? false);
    this.enabled = touch || this.force;
    if (!this.enabled) return;

    scene.input.addPointer(3);
    this.container = scene.add.container(0, 0).setScrollFactor(0).setDepth(9999);
    this.base = scene.add.graphics().setAlpha(this.alpha);
    this.knob = scene.add.graphics().setAlpha(this.alpha);
    this.container.add([this.base, this.knob]);

    const hit = scene.add.rectangle(0, 0, this.size * 3.0, this.size * 3.0, 0, 0)
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

    this._layout(); this._draw();
    scene.scale.on('resize', () => this._layout());
  }

  isEnabled() { return !!this.enabled; }
  getCenter() { return this.center ? { x: this.center.x, y: this.center.y } : { x:0, y:0 }; }
  getRadius() { return this.size * 1.1; } // generous hit perception
  setVisible(v){ if (this.enabled) this.container?.setVisible(v); }
  setOffset(off){ this.offset = off; this._layout(); }

  _layout(){
    if (!this.enabled) return;
    const { width, height } = this.scene.scale;
    const x = Math.floor(width / 2);
    const y = height - this.offset.y - this.size;
    this.container.setPosition(x, y);
    this.center.set(x, y);
  }

  _draw(){
    if (!this.enabled) return;
    const R=this.size, rim=R*0.85, dead=R*this.deadFrac;
    this.base.clear();
    this.base.lineStyle(2, 0x7ec8e3, 0.9).fillStyle(0x0b0d16, 0.4);
    this.base.beginPath(); this.base.arc(0,0,R,0,Math.PI*2); this.base.fillPath(); this.base.strokePath();
    this.base.lineStyle(1, 0xffffff, 0.6).strokeCircle(0,0,rim);
    this.base.lineStyle(1, 0xffffff, 0.25).strokeCircle(0,0,dead);
    this._drawKnob(0,0);
  }
  _drawKnob(dx,dy){
    if (!this.enabled) return;
    const r=Math.max(14,this.size*0.32);
    this.knob.clear();
    this.knob.fillStyle(0xffffff,0.9).fillCircle(dx,dy,r);
    this.knob.lineStyle(2,0x7ec8e3,1).strokeCircle(dx,dy,r);
  }

  _start(p){ if(!this.enabled) return; this.active=true; this._move(p); }
  _move(p){
    if(!this.enabled || !this.active) return;
    const dx=p.worldX-this.center.x, dy=p.worldY-this.center.y;
    const v=new Phaser.Math.Vector2(dx,dy); const max=this.size;
    const dist=v.length(); if(dist>max) v.scale(max/dist);
    const dead=this.size*this.deadFrac;
    if(v.length()<=dead){ this.vector.set(0,0); this._drawKnob(0,0); return; }
    const norm=v.clone().scale(1/max);
    this.vector.copy(norm); this._drawKnob(v.x,v.y);
  }
  _end(){ if(!this.enabled) return; this.active=false; this.vector.set(0,0); this._drawKnob(0,0); }
  getVector(){ return this.enabled ? this.vector : { x:0, y:0 }; }
}
