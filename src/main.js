// // import Phaser
import Phaser, { Game } from "phaser";

//import game scenes
import BootScene from './scenes/BootScene.js';
import PreloadScene from './scenes/PreloadScene.js';
import MenuScene from './scenes/MenuScene.js';
import GameScene from './scenes/GameScene.js';
import UIScene from './scenes/UIScene.js';
import GameOverScene from './scenes/GameOverScene.js';

// Virtual base size: 320x180 is a classic retro-friendly 16:9.
const BASE_W = 320, BASE_H = 180;

const config = {
  type: Phaser.CANVAS,             //Skip default and just use canvas
  parent: 'game',                // Mount the <canvas> into <div id="game">
  width: BASE_W,
  height: BASE_H,
  backgroundColor: '#0d0f1a',    // Deep navy background for contrast with neon tints
  pixelArt: true,                // Nearest-neighbor scaling
  roundPixels: true,             // Avoid half-pixel coordinates
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },        // Top-down shooter => no gravity
      debug: false              // Turn on for collision boxes while debugging
    }
  },
  scale: {
    // FIT will preserve aspect ratio and letterbox if needed.
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  dom: { createContainer: true },
  overflow : false,
  
  scene: [BootScene, PreloadScene, MenuScene, GameScene, UIScene, GameOverScene],
};

new Phaser.Game(config);






