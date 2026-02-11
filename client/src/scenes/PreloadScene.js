// Loads all art/audio and defines animation clips.

export default class PreloadScene extends Phaser.Scene {
  constructor(){ super('Preload'); }

  preload(){
    // load player spritesheet
    this.load.spritesheet('p_idle_front', 'assets/sprites/Entities/Players/Character-Idle-Sheet.png', {
      frameWidth: 50, frameHeight: 50
    });
    this.load.spritesheet('p_idle_back',  'assets/sprites/Entities/Players/Character-idle(-ve)-Sheet.png', {
      frameWidth: 50, frameHeight: 50
    });
    this.load.spritesheet('p_walk_front', 'assets/sprites/Entities/Players/Character-Walk(+ve)-Sheet.png', {
      frameWidth: 50, frameHeight: 50
    });
    this.load.spritesheet('p_walk_back',  'assets/sprites/Entities/Players/Character-Walk(-ve)-Sheet.png', {
      frameWidth: 50, frameHeight: 50
    });

    // load enemy spritesheet
    this.load.spritesheet('e_walk_front', 'assets/sprites/Entities/Enemies/Enemy-Walk(+ve)-Sheet.png', {
      frameWidth: 216, frameHeight: 171
    });
    this.load.spritesheet('e_attack_front', 'assets/sprites/Entities/Enemies/Enemy-attack1(+ve)-Sheet.png', {
      frameWidth: 216, frameHeight: 171
    });

    // bullet and weapon sprite
    this.load.spritesheet('bullet', 'assets/sprites/Weapons/Bullets/AR-Bullet-Sheet.png', {
      frameWidth : 16, frameHeight: 16
    })
    // this.load.image('bullet', 'assets/Weapons/Bullet-Sheet.png')

    // loading sounds
    this.load.audio('button_click', '././assets/Sounds/button-click.mp3');
    this.load.audio('bg_music', '././assets/Sounds/background-music.mp3');
    this.load.audio('player_death', '././assets/Sounds/player-death.mp3');
    const bgMusic = this.sound.get('bg_music');
  };

  create(){
    //   PLAYER ANIMS
    // FRONT (down-facing) sets
    this.anims.create({
      key: 'p_idle_front',
      frames: this.anims.generateFrameNumbers('p_idle_front', { start: 0, end: 2 }), // 3 frames
      frameRate: 6,
      repeat: -1
    });
    this.anims.create({
      key: 'p_walk_front',
      frames: this.anims.generateFrameNumbers('p_walk_front', { start: 0, end: 3 }), // 4 frames
      frameRate: 10,
      repeat: -1
    });

    // BACK (up-facing) sets
    this.anims.create({
      key: 'p_idle_back',
      frames: this.anims.generateFrameNumbers('p_idle_back', { start: 0, end: 3 }), // 4 frames
      frameRate: 4,
      repeat: -1
    });
    this.anims.create({
      key: 'p_walk_back',
      frames: this.anims.generateFrameNumbers('p_walk_back', { start: 0, end: 1 }), // 4 frames
      frameRate: 10,
      repeat: -1


    });

    // ENEMY Anims

    this.anims.create({
      key: 'e_walk_front',
      frames: this.anims.generateFrameNumbers('e_walk_front', { start: 0, end: 3 }), // 4 frames
      frameRate: 8,
      repeat: -1
    });
    this.anims.create({
      key: 'e_attack_front',
      frames: this.anims.generateFrameNumbers('e_attack_front', { start: 0, end: 2 }), // 3 frames
      frameRate: 10,
      repeat: 0
    });

    this.scene.start('Menu');
  }


  if (bgMusic) {
    const totalDuration = bgMusic.totalDuration; // In seconds
    const loopDuration = totalDuration - 2; // Trim last 2 secs
    
    // Add marker for trimmed loop
    bgMusic.addMarker({
      name: 'trimmed_loop',
      start: 0,
      duration: loopDuration
    });
  }
}
