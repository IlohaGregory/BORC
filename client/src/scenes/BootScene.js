//initialize services that must be ready before asset loading.

import { walletService } from '../services/WalletService.js';
import sdk from '@farcaster/frame-sdk';
import Phaser from "phaser";

export default class BootScene extends Phaser.Scene {
  constructor() { super({key:'Boot'}); };

  async create() {
    // Initialize wallet integration early so MenuScene can immediately connect.
    await walletService.init();

    // Signal to Farcaster Mini App that app is ready to display
    try {
      await sdk.actions.ready();
    } catch (e) {
      // Not running in Farcaster context, ignore
    }

    // Jump straight to preloading art/audio.
    this.scene.start('Preload');
  }
}
