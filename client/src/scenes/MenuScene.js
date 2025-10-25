// src/scenes/MenuScene.js
import { walletService, CHAINS } from '../services/WalletService.js';
import { profileService } from '../services/ProfileService.js';

export default class MenuScene extends Phaser.Scene {
  constructor(){ super('Menu'); }

  create(){
    const { width } = this.scale;
    this.add.text(width/2, this.scale.height/3 - 40, 'BORC', { fontFamily:'monospace', fontSize:38, color:'#4d73fdff' }).setOrigin(0.5);

    const panel = document.createElement('div');
    panel.className = 'panel';
    this.add.dom(0, this.scale.height/3, panel).setOrigin(0);
    panel.innerHTML = `
      <div style="display:flex;gap:12px;flex-direction:column;align-items:center;">
        <button id="connect" class="btn">Connect Wallet</button>
        <input id="name" placeholder="Display name" style="padding:8px;font-family:monospace"/>
        <div id="msg" style="min-height:18px;color:#aaa;font-family:monospace;font-size:12px;"></div>
        <button id="play" class="btn">Start</button>
      </div>`;

    const btnConnect = panel.querySelector('#connect');
    const inputName  = panel.querySelector('#name');
    const btnPlay    = panel.querySelector('#play');
    const msg        = panel.querySelector('#msg');

    const existing = profileService.load();
    if (existing?.displayName) inputName.value = existing.displayName;

    let connecting = false;
    const setMsg = (t, color='#aaa') => { msg.textContent = t; msg.style.color = color; };

    btnConnect.onclick = async () => {
      if (connecting) return;
      connecting = true;
      btnConnect.disabled = true;
      setMsg('Connecting…');

      try {
        await walletService.init();
        const { address, displayName } = await walletService.connect();
        const baseName = await walletService.resolveBaseName();
        if (baseName) {
          inputName.value = baseName;
          setMsg(`Welcome, ${baseName}!`);
        } else {
          setMsg('No Base Name found; using wallet address.');
        }


        if (!inputName.value) inputName.value = displayName || walletService.shortAddress(address);
        btnConnect.textContent = walletService.shortAddress(address);
        setMsg('Connected.');

        // Prompt user to switch to Base mainnet (non-blocking)
        try {
          const ok = await walletService.ensureBaseMainnet();
          if (ok) setMsg(`Network: ${CHAINS.BASE_MAINNET.name}`);
          else setMsg(`Network unchanged (you can still play).`);
        } catch (e) {
          // ignore network errors for now
          setMsg('Connected (network check failed).', '#ffb86b');
        }
      } catch (e) {
        setMsg(e?.message || 'Connection failed.', '#ff6a6a');
      } finally {
        connecting = false;
        btnConnect.disabled = false;
      }
    };

    btnPlay.onclick = () => {
      const profile = {
        address: walletService.getAddress() || null,
        displayName: inputName.value?.trim() || walletService.shortAddress() || 'Pilot',
        lastSeen: Date.now()
      };
      profileService.save(profile);

      // clean up DOM before changing scenes
      if (panel && panel.parentNode) panel.remove();

      this.scene.start('WaitingRoom', { profile });
    };
  }
}
