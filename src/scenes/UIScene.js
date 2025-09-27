/**
 * UIScene — HUD + mobile input hub.
 * Exposes registry.get('input') => { vector:{x,y}, autoFire:boolean, aim:{x,y}|null }
 */
import { events } from '../core/Events.js';
import VirtualDPad from '../ui/VirtualDPad.js';
import AimTouchZone from '../ui/AimTouchZone.js';

export default class UIScene extends Phaser.Scene {
  constructor(){ super('UI'); }

  create(data){
    this.profile = data.profile;
    const { width } = this.scale;

    // HUD (name + score)
    this.nameTxt  = this.add.text(4, 2, this.profile.displayName, { fontFamily:'monospace', fontSize:8, color:'#7ec8e3' });
    this.scoreTxt = this.add.text(width-4, 2, '0', { fontFamily:'monospace', fontSize:8, color:'#fff' }).setOrigin(1,0);
    events.on('score:add', n => {
      const s = parseInt(this.scoreTxt.text||'0',10) + n; this.scoreTxt.setText(String(s));
    });

    // Touch capability detection (same as D-pad)
    const input = this.input;
    const isTouchCapable =
      !!input?.manager?.touch || ('ontouchstart' in window) || (navigator.maxTouchPoints ?? 0) > 0 ||
      (window.matchMedia?.('(pointer: coarse)').matches ?? false);

    // Shared input state (GameScene will read this every frame)
    this.registry.set('input', {
      vector: { x:0, y:0 },
      autoFire: isTouchCapable,     // mobile = auto-fire ON by default
      aim: null                     // {x,y} world point or null
    });

    // Controls
    this.dpad = new VirtualDPad(this, {
      size: 60,
      dead: 0.18,
      align: 'bottom-center',       // centered at the bottom
      offset: { x: 0, y: 84 },      // lift from edge for thumb room
      showOnDesktop: false
    });

    // “touch anywhere to aim” (second finger)
    this.aimZone = new AimTouchZone(this);

    // Update registry each frame
    this.events.on('update', () => {
      const state = this.registry.get('input');

      const v = this.dpad?.getVector?.() || { x:0, y:0 };
      state.vector.x = v.x; state.vector.y = v.y;

      if (this.aimZone?.hasAim()) {
        const a = this.aimZone.getAim();
        // reuse same object to avoid GC
        state.aim = state.aim || { x:0, y:0 };
        state.aim.x = a.x; state.aim.y = a.y;
      } else {
        state.aim = null;
      }
    });
  }
}
