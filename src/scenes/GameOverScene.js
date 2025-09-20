/**
 * GameOverScene — post-run results + retry.
 */
export default class GameOverScene extends Phaser.Scene {
  constructor(){ super('GameOver'); }

  create({ score, wave, profile }){
    const { width, height } = this.scale;

    this.add.text(width/2, height/2 - 20, 'MISSION FAILED', {
      fontFamily:'monospace', fontSize:16, color:'#ff6a6a'
    }).setOrigin(0.5);

    this.add.text(width/2, height/2, `${profile.displayName}  |  Score ${score}  |  Wave ${wave}`, {
      fontFamily:'monospace', fontSize:10, color:'#fff'
    }).setOrigin(0.5);

    const again = this.add.text(width/2, height/2 + 30, 'Play Again', {
      fontFamily:'monospace', fontSize:12, color:'#7ec8e3'
    }).setOrigin(0.5).setInteractive();

    again.on('pointerdown', ()=> {
      // Return to Menu to optionally reconnect / change name
      this.scene.start('Menu');
    });
  }
}
