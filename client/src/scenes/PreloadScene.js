// Loads all art/audio and defines animation clips.

export default class PreloadScene extends Phaser.Scene {
  constructor(){ super('Preload'); }

  preload(){
    // load player spritesheet 
    this.load.spritesheet('p_idle_front', 'assets/sprites/Character-Idle-Sheet.png', {
      frameWidth: 50, frameHeight: 50
    });
    this.load.spritesheet('p_idle_back',  'assets/sprites/Character-idle(-ve)-Sheet.png', {
      frameWidth: 50, frameHeight: 50
    });
    this.load.spritesheet('p_walk_front', 'assets/sprites/Character-Walk(+ve)-Sheet.png', {
      frameWidth: 50, frameHeight: 50
    });
    this.load.spritesheet('p_walk_back',  'assets/sprites/Character-Walk(-ve)-Sheet.png', {
      frameWidth: 50, frameHeight: 50
    });

    // load enemy spritesheet
    this.load.spritesheet('e_walk_front', 'assets/sprites/Enemy-Walk(+ve)-Sheet.png', {
      frameWidth: 216, frameHeight: 171
    });
    this.load.spritesheet('e_attack_front', 'assets/sprites/Enemy-attack1(+ve)-Sheet.png', {
      frameWidth: 216, frameHeight: 171
    });

    // bullet and weapon sprite
    this.load.spritesheet('bullet', 'assets/Weapons/Bullet-Sheet.png', {
      frameWidth : 16, frameHeight: 16
    })
    // this.load.image('bullet', 'assets/Weapons/Bullet-Sheet.png')
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
}
