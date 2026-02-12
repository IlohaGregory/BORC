// // import Phaser
import Phaser from "phaser";

//import game scenes
import BootScene from './scenes/BootScene.js';
import PreloadScene from './scenes/PreloadScene.js';
import MenuScene from './scenes/MenuScene.js';
import GameScene from './scenes/GameScene.js';
import UIScene from './scenes/UIScene.js';
import GameOverScene from './scenes/GameOverScene.js';
import WaitingRoomScene from "./scenes/WaitingRoomScene.js";
import MissionSelectScene from './scenes/MissionSelectScene.js';
import DifficultySelectScene from './scenes/DifficultySelectScene.js';

// Virtual base size: 320x180 is a classic retro-friendly 16:9.
const BASE_W = 680, BASE_H = 270;

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
      debug: false             // Turn on for collision boxes while debugging
    }
  },
  scale: {
    // FIT will preserve aspect ratio and letterbox if needed.
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  dom: { createContainer: true },
  scene: [BootScene, PreloadScene, MenuScene, WaitingRoomScene, MissionSelectScene, DifficultySelectScene, GameScene, UIScene, GameOverScene],
  // Mobile performance optimizations
  fps: {
    target: 60,
    forceSetTimeOut: false
  },
  render: {
    antialias: false,
    pixelArt: true,
    roundPixels: true,
    transparent: false,
    clearBeforeRender: true,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    failIfMajorPerformanceCaveat: false,
    powerPreference: 'high-performance',
    batchSize: 4096
  },
  disableContextMenu: true
};

new Phaser.Game(config);