// UIScene.js
// HUD + input hub. Publishes {vector, aimHeld, aim} into registry each frame.

import { events } from '../core/Events.js';
import VirtualDPad from '../ui/VirtualDPad.js';
import AimTouchZone from '../ui/AimTouchZone.js';

export default class UIScene extends Phaser.Scene {
  constructor(){ super('UI'); }

  create(data){
    this.profile = data.profile;
    const { width } = this.scale;

    // HUD
    this.nameTxt  = this.add.text(4, 2, this.profile.displayName, { fontFamily:'monospace', fontSize:8, color:'#7ec8e3' });
    this.scoreTxt = this.add.text(width-4, 2, '0', { fontFamily:'monospace', fontSize:8, color:'#fff' }).setOrigin(1,0);
    events.on('score:add', n => {
      const s = parseInt(this.scoreTxt.text||'0',10) + n;
      this.scoreTxt.setText(String(s));
    });

    // Shared input state
    this.registry.set('input', { vector:{x:0,y:0}, aimHeld:false, aim:null });

    // Controls
    this.dpad = new VirtualDPad(this, { size: 60, dead: 0.18, offset: { x:0, y:84 } });

    // Aim zone (exclude D-pad)
    this.aimZone = new AimTouchZone(this, {
      exclude: () => {
        if (!this.dpad?.isEnabled?.()) return [];
        const c = this.dpad.getCenter();
        return [{ x: c.x, y: c.y, r: this.dpad.getRadius() }];
      },
      tapMs: 180
    });

    // Publish inputs each frame
    this.events.on('update', () => {
      const state = this.registry.get('input');

      const v = this.dpad?.getVector?.() || { x:0, y:0 };
      state.vector.x = v.x; state.vector.y = v.y;

      if (this.aimZone?.isHeld() && this.aimZone.hasAim()) {
        const a = this.aimZone.getAim();
        state.aimHeld = true;
        state.aim = state.aim || { x:0, y:0 };
        state.aim.x = a.x; state.aim.y = a.y;
      } else {
        state.aimHeld = false;
        state.aim = null;
      }
    });
  }
}
