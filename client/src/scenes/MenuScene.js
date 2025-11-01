// src/scenes/MenuScene.js
import { walletService, CHAINS } from '../services/WalletService.js';
import { profileService } from '../services/ProfileService.js';
import contractService from '../services/ContractService.js';

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
    const { width, height } = this.scale;

    // --- Title ---
    this.add.text(width / 2, height / 3 - 40, 'BORC', {
      fontFamily: 'monospace',
      fontSize: 38,
      color: '#4d73fdff'
    }).setOrigin(0.5);

    // --- UI Panel ---
    const panel = document.createElement('div');
    panel.className = 'panel';
    this.add.dom(0, height / 3, panel).setOrigin(0);
    panel.innerHTML = `
      <div style="display:flex;gap:12px;flex-direction:column;align-items:center;">
        <button id="connect" class="btn">Connect Wallet</button>
        <input id="name" placeholder="Display name" style="padding:8px;font-family:monospace;display:none;"/>
        <button id="play" class="btn" disabled>Start</button>
      </div>
    `;

    const btnConnect = panel.querySelector('#connect');
    const inputName = panel.querySelector('#name');
    const btnPlay = panel.querySelector('#play');

    // --- Toast Message Element ---
    const toast = document.createElement('div');
    Object.assign(toast.style, {
      position: 'fixed',
      bottom: '32px',
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '10px 16px',
      borderRadius: '8px',
      background: '#333',
      color: '#fff',
      fontFamily: 'monospace',
      fontSize: '14px',
      opacity: '0',
      transition: 'opacity 0.3s ease',
      pointerEvents: 'none',
      zIndex: '1000'
    });
    document.body.appendChild(toast);

    const showToast = (text, color = '#fff', duration = 2500) => {
      toast.textContent = text;
      toast.style.color = color;
      toast.style.opacity = '1';
      clearTimeout(this._toastTimeout);
      this._toastTimeout = setTimeout(() => (toast.style.opacity = '0'), duration);
    };

    btnConnect.onclick = async () => {
      if (btnConnect.disabled) return;
      btnConnect.disabled = true;
      showToast('Connecting to wallet...');

      try {
        await walletService.init();
        const { address, displayName } = await walletService.connect();

        console.log('Connected wallet info:', address, displayName);

        // unwrap address safely
        const addr = typeof address === 'object' ? address.address || address[0] : address;
        if (!addr || !addr.startsWith('0x')) {
          showToast('Invalid wallet address returned.', '#ff6a6a');
          btnConnect.disabled = false;
          return;
        }

        // Step 1: Try resolving Base Name
        const baseName = await walletService.resolveBaseName().catch(() => null);
        let finalName = baseName || displayName || walletService.shortAddress(addr);

        if (baseName) {
          showToast(`Welcome, ${baseName}!`);
          inputName.style.display = 'none';
          inputName.value = baseName;
        } else {
          showToast('No Base Name found. Choose a display name.');
          inputName.style.display = 'block';
          inputName.value = finalName;
        }

        btnConnect.textContent = walletService.shortAddress(addr);
        btnPlay.disabled = false;

      } catch (e) {
        console.error(e);
        showToast(e?.message || 'Connection failed.', '#ff6a6a');
      } finally {
        btnConnect.disabled = false;
      }
    };

    btnPlay.onclick = async () => {
      if (btnPlay.disabled) return;
      btnPlay.disabled = true;
      showToast('Starting session...');
      try {
        // Get display name from the input (local only)
        const displayNameInput = document.getElementById('name');
        const displayName = displayNameInput?.value?.trim() || walletService.shortAddress() || "Pilot";
        if (displayName.length < 3) {
          showToast('Name too short', '#ff6a6a');
          return;
        }
        const baseName = await walletService.resolveBaseName().catch(() => null);

        profileService.save({ displayName, baseName });
        // Grab wallet + base name if available
        const address = walletService?.address || "0x0";

        console.log("🎮 Starting session with:", { baseName, displayName, address });

        // Construct lightweight local profile
        const profile = { baseName, displayName, address };

        // Launch the waiting room
        this.scene.start("WaitingRoom", { profile });

      } catch (err) {
        console.error("Play flow failed:", err);
        showToast("Failed to start: " + (err?.message || err), '#ff6a6a');
      } finally {
        btnPlay.disabled = false;
      }
    };

    
  }

  shutdown() {
    // Clean up toast
    if (this._toastTimeout) clearTimeout(this._toastTimeout);
    const toast = document.querySelector('div[style*="position: fixed"][style*="bottom: 32px"]');
    if (toast) toast.remove();
  }
}