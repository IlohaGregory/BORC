//initialize services that must be ready before asset loading.

import { walletService } from '../services/WalletService.js';
import Phaser from "phaser";

export default class BootScene extends Phaser.Scene {
  constructor() { super({key:'Boot'}); };
  
  async create() {
    this.add.text(4, 4, 'BootScene', { fontFamily:'monospace', fontSize:10, color:'#7ec8e3' });
    console.log("menus");
    // Initialize wallet integration early so MenuScene can immediately connect.
    await walletService.init();

    // Jump straight to preloading art/audio.
    this.scene.start('Preload');
  }
}
