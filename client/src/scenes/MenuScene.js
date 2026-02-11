// src/scenes/MenuScene.js
import { walletService } from '../services/WalletService.js';

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  preload() {
  this.load.image('bg_mobile', '././assets/Backgrounds/Title-Screens/Title-page-mobile.png');
  this.load.image('bg_desktop', '././assets/Backgrounds/Title-Screens/Title-page-desktop.png');
  }

  create() {
    const { width, height } = this.scale;

    const isDesktop = this.sys.game.device.os.desktop;
    const bgKey = isDesktop ? 'bg_desktop' : 'bg_mobile';
    this.bg = this.add.image(0, 0, bgKey)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-1) // Ensure it's behind other elements
      .setDisplaySize(width, height); // Scale to fit screen

    // Handle resize to keep background filling the screen
    this.scale.on('resize', (gameSize) => {
      if (this.bg) {
        this.bg.setDisplaySize(gameSize.width, gameSize.height);
      }
    });

    // --- UI Panel ---
    const panel = document.createElement('div');
    panel.className = 'panel';
    this.add.dom(0, height / 2, panel).setOrigin(0);
    panel.innerHTML = `
      <div style="display:flex;gap:12px;flex-direction:column;align-items:center;">
        <button id="play" class="btn" style="font-size:18px;padding:12px 32px;">PLAY</button>
        <button id="connect" class="btn" style="font-size:12px;padding:8px 16px;opacity:0.8;">Connect Wallet</button>
      </div>
    `;

    const btnPlay = panel.querySelector('#play');
    const btnConnect = panel.querySelector('#connect');

    // --- Toast ---
    this.toast = document.createElement('div');
    Object.assign(this.toast.style, {
      padding: '10px 16px',
      borderRadius: '8px',
      background: '#333',
      color: '#fff',
      fontFamily: 'monospace',
      fontSize: '14px',
      opacity: '0',
      transition: 'opacity 0.3s ease',
      pointerEvents: 'none'
    });
    // Use Phaser DOM system - position at bottom center
    this.toastDom = this.add.dom(width / 2, height - 32, this.toast).setScrollFactor(0);

    const showToast = (text, color = '#fff', duration = 2500) => {
      this.toast.textContent = text;
      this.toast.style.color = color;
      this.toast.style.opacity = '1';
      clearTimeout(this._toastTimeout);
      this._toastTimeout = setTimeout(() => (this.toast.style.opacity = '0'), duration);
    };

    // --- PLAY button: always goes to WaitingRoom ---
    btnPlay.onclick = () => {
      this.sound.play('bg_music', {
        marker: 'trimmed_loop',
        loop: true,
        volume: 0.5
      });
      this.sound.play('button_click');
      if (btnPlay.disabled) return;
      btnPlay.disabled = true;
      this.scene.start('WaitingRoom', { walletConnected: walletService.isConnected() });
    };

    // --- Connect Wallet: optional upgrade ---
    btnConnect.onclick = async () => {
      if (btnConnect.disabled) return;
      btnConnect.disabled = true;
      showToast('Connecting to wallet...');

      try {
        await walletService.init();
        const { address, displayName } = await walletService.connect();

        const addr = typeof address === 'object' ? address.address || address[0] : address;
        if (!addr || !addr.startsWith('0x')) {
          showToast('Invalid wallet address returned.', '#ff6a6a');
          btnConnect.disabled = false;
          return;
        }

        const baseName = await walletService.resolveBaseName().catch(() => null);
        const finalName = baseName || displayName || walletService.shortAddress(addr);

        if (baseName) {
          showToast(`Welcome, ${baseName}!`);
        } else {
          showToast(`Connected: ${walletService.shortAddress(addr)}`);
        }

        btnConnect.textContent = walletService.shortAddress(addr);

      } catch (e) {
        console.error(e);
        showToast(e?.message || 'Connection failed.', '#ff6a6a');
      } finally {
        btnConnect.disabled = false;
      }
    };

    // If wallet already connected, show address
    if (walletService.isConnected()) {
      btnConnect.textContent = walletService.shortAddress();
    }
  }

  shutdown() {
    if (this._toastTimeout) {
      clearTimeout(this._toastTimeout);
      this._toastTimeout = null;
    }
    // Phaser handles DOM cleanup automatically
    this.toast = null;
    this.toastDom = null;
  }
}
