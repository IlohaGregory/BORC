//initialize services that must be ready before asset loading.

import { walletService } from '../services/WalletService.js';
import Phaser from "phaser";

export default class BootScene extends Phaser.Scene {
  constructor() { super({key:'Boot'}); };
  
  async create() {
    // Initialize wallet integration early so MenuScene can immediately connect.
    await walletService.init();

    // Jump straight to preloading art/audio.
    this.scene.start('Preload');
  }
}
