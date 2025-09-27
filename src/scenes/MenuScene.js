/**
 *Wallet sign-in + editable display name, then start game.
 * Using a DOM overlay keeps UI simple without bringing in a UI library.
*/
// src/scenes/MenuScene.js
import { walletService, CHAINS } from '../services/WalletService.js';
import { profileService } from '../services/ProfileService.js';

export default class MenuScene extends Phaser.Scene {
  constructor(){ super('Menu'); }

  create(){
    const { width } = this.scale;
    this.add.text(width/2, this.scale.height/3 - 40, 'BORC', { fontFamily:'monospace', fontSize:38, color:'#4d73fdff' }).setOrigin(0.5);

    const panel = document.createElement('div'); panel.className='panel'; this.add.dom(0,this.scale.height/3, panel).setOrigin(0);
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
      if (connecting) return; // debounce
      connecting = true;
      btnConnect.disabled = true; setMsg('Connecting…');

      try {
        await walletService.init(); // safe to call if already in Boot too
        const { displayName } = await walletService.connect();
        if (!inputName.value) inputName.value = displayName;
        btnConnect.textContent = walletService.shortAddress();
        setMsg('Connected.');

        // DEV: ask for Base Sepolia, but don’t hard-fail if user rejects
        const ok = await walletService.ensureBaseSepolia();
        if (ok) setMsg(`Network: ${CHAINS.BASE_SEPOLIA.name}`);
        else setMsg(`Network unchanged (you can still play).`);
      } catch (e) {
        // If user rejected, WalletService already swallowed it where sensible.
        setMsg(e?.message || 'Connection failed.', '#ff6a6a');
      } finally {
        connecting = false;
        btnConnect.disabled = false;
      }
    };

    btnPlay.onclick = () => {
      const profile = {
        address: walletService.getAddress(),                 // may be null if they skipped
        displayName: inputName.value?.trim() || 'Pilot',
        lastSeen: Date.now()
      };
      profileService.save(profile);
      panel.remove();
      this.scene.start('Game', { profile });
      this.scene.launch('UI',   { profile });
    };
  }
}
