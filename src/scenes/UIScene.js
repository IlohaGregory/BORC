/**
 * UIScene — a lightweight HUD overlay that listens for score events.
 * Why a separate scene? It simplifies layering (HUD always on top) and keeps UI logic isolated.
 */
import { events } from '../core/Events.js';

export default class UIScene extends Phaser.Scene {
  constructor(){ super('UI'); }

  create(data){
    this.profile = data.profile;
    const { width } = this.scale;

    // Left: player name (editable in menu; address fallback)
    this.nameTxt  = this.add.text(4, 2, this.profile.displayName, {
      fontFamily:'monospace', fontSize:8, color:'#7ec8e3'
    });

    // Right: score (updated via event)
    this.scoreTxt = this.add.text(width-4, 2, '0', {
      fontFamily:'monospace', fontSize:8, color:'#fff'
    }).setOrigin(1,0);

    // Listen for score events and update the HUD without touching GameScene
    events.on('score:add', n => {
      const s = parseInt(this.scoreTxt.text||'0',10) + n;
      this.scoreTxt.setText(String(s));
    });
  }
}
