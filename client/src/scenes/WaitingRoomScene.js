// client/src/scenes/WaitingRoomScene.js
import Phaser from 'phaser';
import { networkService } from '../services/NetworkService.js';
import { socialService } from '../services/SocialService.js';
import { walletService } from '../services/WalletService.js';
import { profileService } from '../services/ProfileService.js';
import { getMissionList, DIFFICULTY_CONFIG } from '../../../shared/missions.js';

export default class WaitingRoomScene extends Phaser.Scene {
  constructor(){ super('WaitingRoom'); }

  init(data) {
    this._walletConnected = data?.walletConnected ?? walletService.isConnected();
    this._fromGameOver = data?.fromGameOver ?? false;
    this._prevMode = data?.mode || 'solo';
    this._socialConnected = false;
    this._joining = false;
    this._squad = null;
    this._friends = [];
    this._friendRequests = { incoming: [], outgoing: [] };
    this._onlinePlayers = [];
    this._selectedMissionId = 'bug_hunt_1'; // Default mission (legacy support)
    this._selectedDifficulty = 2; // Default to Medium difficulty
  }

  create() {
    this.cameras.main.setBackgroundColor('#000000');
    this.add.text(this.scale.width/2, 10, 'BORC', { fontFamily:'monospace', fontSize:16, color:'#4d73fd' }).setOrigin(0.5, 0);

    // --- Main panel ---
    const { width, height } = this.scale;
    this.panel = document.createElement('div');
    Object.assign(this.panel.style, {
      width:'360px',
      background:'rgba(0,0,0,0.82)',
      color:'#fff',
      padding:'10px',
      fontFamily:'monospace',
      borderRadius:'6px',
      boxSizing:'border-box',
      maxHeight: `${height - 44}px`,
      overflowY: 'auto',
    });
    // Use Phaser DOM system - position top-left with offset
    this.panelDom = this.add.dom(8, 36, this.panel).setOrigin(0, 0).setScrollFactor(0);

    // --- Invite box (floating) ---
    this.inviteBox = document.createElement('div');
    Object.assign(this.inviteBox.style, {
      background: 'rgba(20,20,25,0.98)',
      color: '#fff',
      padding: '12px',
      fontFamily: 'monospace',
      display: 'none',
      borderRadius: '8px',
      maxWidth: '320px'
    });
    // Use Phaser DOM system - position top-right with offset
    this.inviteBoxDom = this.add.dom(width - 10, 30, this.inviteBox).setOrigin(1, 0).setScrollFactor(0).setDepth(9999);

    this._buildPanel();
    this._wireCallbacks();

    this.input.keyboard.on('keydown-ESC', () => this._exitToMenu());
  }

  _wireCallbacks() {
    socialService.onSquadUpdate = (msg) => {
      this._squad = msg.squad;
      this._refreshMpPanel();
    };
    socialService.onSquadDisbanded = () => {
      this._squad = null;
      this._refreshMpPanel();
    };
    socialService.onSquadInvite = (msg) => this._handleSquadInvite(msg);
    socialService.onGameReady = (msg) => this._handleGameReady(msg);
    socialService.onGameReadyError = (msg) => {
      console.warn('[WaitingRoom] game_ready_error', msg);
      alert('Failed to start game: ' + (msg?.message || 'unknown error'));
      this.panel?.querySelectorAll('button').forEach(b => b.disabled = false);
    };
    socialService.onFriendRequest = (msg) => {
      this._loadFriendRequests();
      this._showNotification(`Friend request from ${msg.displayName || msg.from}`);
    };
    socialService.onFriendAccepted = (msg) => {
      this._loadFriends();
      this._showNotification(`${msg.displayName || msg.address} accepted your friend request!`);
    };
    socialService.onFriendOnline = () => this._loadFriends();
    socialService.onFriendOffline = () => this._loadFriends();
    socialService.onMatchmakingStatus = (msg) => {
      if (msg.status === 'timeout') {
        alert('Matchmaking timed out.');
        this.panel?.querySelectorAll('button').forEach(b => b.disabled = false);
      }
    };
  }

  _buildPanel() {
    const profile = profileService.load() || {};
    const walletAddr = walletService.getAddress?.() || null;
    const defaultName = profile.displayName || (walletAddr ? walletService.shortAddress(walletAddr) : 'Pilot');
    const isSolo = !this._walletConnected;

    this.panel.innerHTML = `
      <div style="margin-bottom:10px;">
        <div style="margin-bottom:6px;font-size:11px;color:#aaa;">Display Name</div>
        <input id="wrName" value="${this._escHtml(defaultName)}" placeholder="Display name"
          style="width:100%;padding:6px;font-family:monospace;font-size:13px;background:#1a1a2e;color:#fff;border:1px solid #333;border-radius:4px;box-sizing:border-box;" />
        <div style="margin-top:6px;font-size:10px;color:#666;">
          Wallet: ${walletAddr ? walletService.shortAddress(walletAddr) : '<span style="color:#ff7070">Not connected</span>'}
        </div>
      </div>

      <hr style="border-color:#333;" />

      <div style="margin:8px 0;display:flex;align-items:center;gap:8px;">
        <input type="checkbox" id="wrSolo" ${isSolo ? 'checked disabled' : 'checked'} />
        <label for="wrSolo" style="font-size:12px;cursor:pointer;">Solo Play</label>
      </div>

      <div id="wrSoloNotice" style="margin:6px 0;padding:8px;background:rgba(255,255,255,0.05);border-radius:4px;font-size:11px;color:#aaa;">
        Solo play — scores are local only. No leaderboard, no rewards.
        ${!this._walletConnected ? '<br/><br/><button id="wrConnectWallet" style="font-size:11px;padding:4px 8px;cursor:pointer;">Connect Wallet to play with friends</button>' : ''}
      </div>

      <div id="wrMpPanel" style="display:none;"></div>

      <div id="wrNotification" style="display:none;margin:6px 0;padding:6px 8px;background:#1a3a1a;border-radius:4px;font-size:11px;color:#90ee90;"></div>

      <hr style="border-color:#333;" />

      <div style="margin-top:8px;text-align:center;">
        <button id="wrStart" style="font-size:16px;padding:10px 32px;background:#4d73fd;color:#fff;border:none;border-radius:6px;cursor:pointer;font-family:monospace;">
          START
        </button>
      </div>
    `;

    // Wire up elements
    const nameInput = this.panel.querySelector('#wrName');
    const soloCheckbox = this.panel.querySelector('#wrSolo');
    const soloNotice = this.panel.querySelector('#wrSoloNotice');
    const mpPanel = this.panel.querySelector('#wrMpPanel');
    const startBtn = this.panel.querySelector('#wrStart');
    const connectBtn = this.panel.querySelector('#wrConnectWallet');

    nameInput.addEventListener('input', () => {
      const name = nameInput.value.trim();
      if (name.length > 0) {
        const existing = profileService.load() || {};
        profileService.save({ ...existing, displayName: name });
      }
    });

    soloCheckbox.addEventListener('change', () => {
      const solo = soloCheckbox.checked;
      soloNotice.style.display = solo ? 'block' : 'none';
      mpPanel.style.display = solo ? 'none' : 'block';
      this.inviteBox.style.display = 'none';

      if (!solo && !this._socialConnected) {
        this._connectSocial();
      }
    });

    if (connectBtn) {
      connectBtn.onclick = async () => {
        connectBtn.disabled = true;
        connectBtn.textContent = 'Connecting...';
        try {
          await walletService.init();
          await walletService.connect();
          await walletService.resolveBaseName().catch(() => null);
          this._walletConnected = true;
          this._buildPanel();
        } catch (e) {
          console.error('Wallet connect failed:', e);
          connectBtn.textContent = 'Connect Wallet to play with friends';
          connectBtn.disabled = false;
        }
      };
    }

    startBtn.onclick = () => {
      if (startBtn.disabled) return;
      startBtn.disabled = true;

      const name = nameInput.value.trim() || 'Pilot';
      const baseName = walletService.displayName?.endsWith?.('.base.eth') ? walletService.displayName : null;
      const address = walletService.getAddress?.() || '0x0';
      profileService.save({ displayName: name, baseName });
      const profile = { displayName: name, baseName, address };

      if (soloCheckbox.checked) {
        // Go to difficulty select for solo play (procedural missions)
        this.scene.start('DifficultySelect', { mode: 'solo', profile });
      } else {
        this._startMultiplayer(profile);
      }
    };

    // Initial visibility
    if (soloCheckbox.checked) {
      soloNotice.style.display = 'block';
      mpPanel.style.display = 'none';
    } else {
      soloNotice.style.display = 'none';
      mpPanel.style.display = 'block';
      if (!this._socialConnected) this._connectSocial();
    }
  }

  async _connectSocial() {
    if (this._socialConnected) return;
    const mpPanel = this.panel?.querySelector('#wrMpPanel');
    if (mpPanel) mpPanel.innerHTML = '<div style="color:#aaa;padding:8px;">Connecting...</div>';

    const address = walletService.getAddress?.();
    if (!address) {
      if (mpPanel) mpPanel.innerHTML = '<div style="color:#ff8a8a;padding:8px;">Wallet not connected</div>';
      return;
    }

    try {
      // Upsert profile on server
      const profile = profileService.load() || {};
      const baseName = walletService.displayName?.endsWith?.('.base.eth') ? walletService.displayName : null;
      await socialService.updateProfile(address, {
        displayName: profile.displayName || walletService.shortAddress(address),
        baseName,
      });

      // Connect WebSocket
      socialService.connect(address);
      this._socialConnected = true;

      // Load initial data
      await Promise.all([
        this._loadFriends(),
        this._loadFriendRequests(),
        this._loadOnlinePlayers(),
        this._loadMySquad(),
      ]);

      this._refreshMpPanel();
    } catch (e) {
      console.error('Social connect failed', e);
      if (mpPanel) mpPanel.innerHTML = '<div style="color:#ff8a8a;padding:8px;">Connection failed: ' + (e.message || e) + '</div>';
    }
  }

  async _loadFriends() {
    const address = walletService.getAddress?.();
    if (!address) return;
    try {
      const data = await socialService.getFriends(address);
      this._friends = data.friends || [];
      this._refreshMpPanel();
    } catch (_) {}
  }

  async _loadFriendRequests() {
    const address = walletService.getAddress?.();
    if (!address) return;
    try {
      this._friendRequests = await socialService.getFriendRequests(address);
      this._refreshMpPanel();
    } catch (_) {}
  }

  async _loadOnlinePlayers() {
    try {
      const data = await socialService.getOnlinePlayers();
      this._onlinePlayers = data.players || [];
      this._refreshMpPanel();
    } catch (_) {}
  }

  async _loadMySquad() {
    const address = walletService.getAddress?.();
    if (!address) return;
    try {
      const data = await socialService.getMySquad(address);
      this._squad = data.squad;
      this._refreshMpPanel();
    } catch (_) {}
  }

  _refreshMpPanel() {
    const mpPanel = this.panel?.querySelector('#wrMpPanel');
    if (!mpPanel) return;
    const soloCheckbox = this.panel?.querySelector('#wrSolo');
    if (soloCheckbox?.checked) return;

    const myAddr = walletService.getAddress?.()?.toLowerCase();
    const getDisplayName = (p) => {
      if (!p) return 'Unknown';
      return p.baseName || p.displayName || (p.address ? `${p.address.slice(0,6)}...${p.address.slice(-4)}` : 'Guest');
    };

    let html = '';

    // --- Friend requests ---
    const incoming = this._friendRequests.incoming || [];
    if (incoming.length > 0) {
      html += '<div style="margin-bottom:8px;"><strong style="font-size:11px;color:#ffaa00;">Friend Requests</strong></div>';
      incoming.forEach(r => {
        html += `<div style="margin:4px 0;font-size:11px;">
          ${getDisplayName(r)}
          <button data-accept-from="${r.address}" class="acceptFriendBtn" style="margin-left:4px;font-size:10px;cursor:pointer;background:#3ae374;border:none;border-radius:3px;padding:2px 6px;">Accept</button>
          <button data-reject-from="${r.address}" class="rejectFriendBtn" style="margin-left:2px;font-size:10px;cursor:pointer;background:#ff6a6a;border:none;border-radius:3px;padding:2px 6px;color:#fff;">Reject</button>
        </div>`;
      });
      html += '<hr style="border-color:#333;"/>';
    }

    // --- Friends list ---
    html += '<div style="margin-bottom:4px;"><strong style="font-size:11px;">Friends</strong></div>';
    if (this._friends.length === 0) {
      html += '<div style="font-size:10px;color:#666;margin-bottom:6px;">No friends yet. Add players below!</div>';
    } else {
      this._friends.forEach(f => {
        const status = f.online ? '<span style="color:#3ae374;">online</span>' : '<span style="color:#666;">offline</span>';
        html += `<div style="margin:4px 0;font-size:11px;">
          ${getDisplayName(f)} ${status}`;
        if (f.online && this._squad) {
          html += ` <button data-invite-friend="${f.address}" class="inviteFriendBtn" style="font-size:9px;cursor:pointer;">Invite</button>`;
        }
        html += `</div>`;
      });
    }

    html += '<hr style="border-color:#333;"/>';

    // --- Online players (discovery) ---
    html += '<div style="margin-bottom:4px;"><strong style="font-size:11px;">Online Players</strong> <button id="refreshOnline" style="font-size:9px;cursor:pointer;">Refresh</button></div>';
    const otherOnline = this._onlinePlayers.filter(p => p.address !== myAddr);
    if (otherOnline.length === 0) {
      html += '<div style="font-size:10px;color:#666;margin-bottom:6px;">No other players online</div>';
    } else {
      otherOnline.forEach(p => {
        const isFriend = this._friends.some(f => f.address === p.address);
        html += `<div style="margin:4px 0;font-size:11px;">
          ${getDisplayName(p)}`;
        if (!isFriend) {
          html += ` <button data-add-friend="${p.address}" class="addFriendBtn" style="font-size:9px;cursor:pointer;">+ Friend</button>`;
        }
        if (this._squad) {
          html += ` <button data-invite-player="${p.address}" class="invitePlayerBtn" style="font-size:9px;cursor:pointer;">Invite</button>`;
        }
        html += `</div>`;
      });
    }

    html += '<hr style="border-color:#333;"/>';

    // --- Squad panel ---
    html += '<div style="margin-bottom:4px;"><strong style="font-size:11px;">Squad</strong></div>';
    if (!this._squad) {
      html += `<button id="createSquadBtn" style="font-size:11px;cursor:pointer;padding:4px 10px;">Create Squad</button>`;
    } else {
      const sq = this._squad;
      const isLeader = sq.leader === myAddr;

      html += `<div style="padding:6px;background:rgba(255,255,255,0.05);border-radius:4px;margin-bottom:6px;">`;
      html += `<div style="font-size:10px;color:#aaa;margin-bottom:4px;">Squad ${sq.id} (${sq.members.length}/3)</div>`;
      sq.members.forEach(m => {
        const isMe = m.address === myAddr;
        const leader = m.address === sq.leader ? ' [Leader]' : '';
        const readyTag = m.ready ? ' <span style="color:#3ae374;">Ready</span>' : ' <span style="color:#ff7070;">Not Ready</span>';
        html += `<div style="font-size:11px;margin:2px 0;">${getDisplayName(m)}${leader}${readyTag}${isMe ? ' (you)' : ''}</div>`;
      });
      html += `</div>`;

      // Difficulty selector (leader only)
      if (isLeader) {
        html += '<div style="margin:6px 0;">';
        html += '<div style="font-size:10px;color:#aaa;margin-bottom:4px;">Select Difficulty:</div>';
        html += '<select id="difficultySelect" style="font-family:monospace;font-size:11px;padding:4px;background:#1a1a2e;color:#fff;border:1px solid #333;border-radius:4px;width:100%;">';
        [1, 2, 3].forEach(d => {
          const cfg = DIFFICULTY_CONFIG[d];
          const stars = '\u2605'.repeat(d) + '\u2606'.repeat(3 - d);
          const selected = d === this._selectedDifficulty ? 'selected' : '';
          html += `<option value="${d}" ${selected}>${cfg.name} ${stars}</option>`;
        });
        html += '</select>';
        html += '</div>';
      }

      // Controls
      html += '<div style="display:flex;gap:6px;flex-wrap:wrap;">';
      if (!isLeader) {
        const me = sq.members.find(m => m.address === myAddr);
        const amReady = me?.ready ?? false;
        html += `<button id="readyBtn" style="font-size:11px;cursor:pointer;padding:4px 10px;">${amReady ? 'Unready' : 'Ready'}</button>`;
      }
      html += `<button id="leaveSquadBtn" style="font-size:11px;cursor:pointer;padding:4px 10px;">Leave</button>`;
      if (isLeader) {
        const allReady = sq.members.every(m => m.ready);
        html += `<button id="squadStartBtn" style="font-size:11px;cursor:pointer;padding:4px 10px;background:#3ae374;border:none;border-radius:4px;" ${allReady ? '' : 'disabled'}>Start Squad</button>`;
      }
      html += '</div>';
    }

    mpPanel.innerHTML = html;

    // --- Wire buttons ---
    const myAddress = myAddr;

    // Accept/reject friend requests
    mpPanel.querySelectorAll('.acceptFriendBtn').forEach(btn => {
      btn.onclick = async () => {
        btn.disabled = true;
        await socialService.acceptFriendRequest(btn.dataset.acceptFrom, myAddress).catch(e => console.error('accept friend err', e));
        this._loadFriends();
        this._loadFriendRequests();
      };
    });
    mpPanel.querySelectorAll('.rejectFriendBtn').forEach(btn => {
      btn.onclick = async () => {
        btn.disabled = true;
        await socialService.rejectFriendRequest(btn.dataset.rejectFrom, myAddress).catch(e => console.error('reject friend err', e));
        this._loadFriendRequests();
      };
    });

    // Add friend
    mpPanel.querySelectorAll('.addFriendBtn').forEach(btn => {
      btn.onclick = async () => {
        btn.disabled = true;
        btn.textContent = 'Sent';
        await socialService.sendFriendRequest(myAddress, btn.dataset.addFriend).catch(e => console.error('add friend err', e));
      };
    });

    // Invite friend/player to squad
    mpPanel.querySelectorAll('.inviteFriendBtn').forEach(btn => {
      btn.onclick = async () => {
        if (!this._squad) return;
        btn.disabled = true;
        await socialService.inviteToSquad(this._squad.id, myAddress, btn.dataset.inviteFriend).catch(e => console.error('invite err', e));
      };
    });
    mpPanel.querySelectorAll('.invitePlayerBtn').forEach(btn => {
      btn.onclick = async () => {
        if (!this._squad) return;
        btn.disabled = true;
        await socialService.inviteToSquad(this._squad.id, myAddress, btn.dataset.invitePlayer).catch(e => console.error('invite err', e));
      };
    });

    // Refresh online players
    const refreshBtn = mpPanel.querySelector('#refreshOnline');
    if (refreshBtn) refreshBtn.onclick = () => this._loadOnlinePlayers();

    // Create squad
    const createSquadBtn = mpPanel.querySelector('#createSquadBtn');
    if (createSquadBtn) {
      createSquadBtn.onclick = async () => {
        createSquadBtn.disabled = true;
        try {
          const data = await socialService.createSquad(myAddress);
          this._squad = data.squad;
          this._refreshMpPanel();
        } catch (e) {
          console.error('Create squad err', e);
          createSquadBtn.disabled = false;
        }
      };
    }

    // Ready toggle
    const readyBtn = mpPanel.querySelector('#readyBtn');
    if (readyBtn) {
      readyBtn.onclick = async () => {
        if (!this._squad) return;
        const me = this._squad.members.find(m => m.address === myAddress);
        const amReady = me?.ready ?? false;
        await socialService.setReady(this._squad.id, myAddress, !amReady).catch(e => console.error('setReady err', e));
      };
    }

    // Leave squad
    const leaveSquadBtn = mpPanel.querySelector('#leaveSquadBtn');
    if (leaveSquadBtn) {
      leaveSquadBtn.onclick = async () => {
        if (!this._squad) return;
        await socialService.leaveSquad(this._squad.id, myAddress).catch(e => console.error('leave squad err', e));
        this._squad = null;
        this._refreshMpPanel();
      };
    }

    // Difficulty selector
    const difficultySelect = mpPanel.querySelector('#difficultySelect');
    if (difficultySelect) {
      difficultySelect.onchange = () => {
        this._selectedDifficulty = parseInt(difficultySelect.value, 10);
      };
    }

    // Start squad
    const squadStartBtn = mpPanel.querySelector('#squadStartBtn');
    if (squadStartBtn) {
      squadStartBtn.onclick = async () => {
        squadStartBtn.disabled = true;
        squadStartBtn.textContent = 'Starting...';
        try {
          // Use difficulty-based procedural generation
          await socialService.startMatch(this._squad.id, myAddress, null, this._selectedDifficulty);
        } catch (e) {
          console.error('Start failed', e);
          alert('Start failed: ' + (e?.message || e));
          squadStartBtn.disabled = false;
          squadStartBtn.textContent = 'Start Squad';
        }
      };
    }
  }

  async _startMultiplayer(profile) {
    const address = walletService.getAddress?.();

    // If in a squad as leader, the squad start button handles it
    // Wallet is optional - allow squad start without wallet connection
    if (this._squad && (!address || this._squad.leader === address.toLowerCase())) {
      const allReady = this._squad.members.every(m => m.ready);
      if (allReady) {
        try {
          // Use difficulty-based procedural generation
          await socialService.startMatch(this._squad.id, address || 'guest', null, this._selectedDifficulty);
        } catch (e) {
          alert('Start failed: ' + (e?.message || e));
          this.panel?.querySelector('#wrStart')?.removeAttribute('disabled');
        }
      } else {
        alert('Not all squad members are ready');
        this.panel?.querySelector('#wrStart')?.removeAttribute('disabled');
      }
      return;
    }

    // Otherwise start matchmaking (guest mode if no wallet)
    try {
      await socialService.startMatchmaking(address || 'guest_' + Math.random().toString(36).substr(2, 9));
    } catch (e) {
      console.error('Matchmaking failed', e);
      alert('Matchmaking failed: ' + (e?.message || e));
      this.panel?.querySelector('#wrStart')?.removeAttribute('disabled');
    }
  }

  _handleSquadInvite(msg) {
    this.inviteBox.innerHTML = `
      <div style="font-size:14px"><strong>Squad Invite from ${msg.fromName || msg.from}</strong></div>
      <div style="margin-top:8px;color:#ddd;font-size:12px">Join their squad?</div>
      <div style="margin-top:10px;display:flex;gap:8px">
        <button id="acceptInvite" style="cursor:pointer;">Accept</button>
        <button id="declineInvite" style="cursor:pointer;">Decline</button>
      </div>
    `;
    this.inviteBox.style.display = 'block';
    setTimeout(() => { if (this.inviteBox) this.inviteBox.style.display = 'none'; }, 60000);

    this.inviteBox.querySelector('#acceptInvite').onclick = async () => {
      const myAddr = walletService.getAddress?.();
      if (!myAddr) return;
      try {
        const data = await socialService.joinSquad(msg.squadId, myAddr);
        this._squad = data.squad;
        // Uncheck solo
        const soloCheckbox = this.panel?.querySelector('#wrSolo');
        if (soloCheckbox && soloCheckbox.checked) {
          soloCheckbox.checked = false;
          soloCheckbox.dispatchEvent(new Event('change'));
        }
        this._refreshMpPanel();
      } catch (err) {
        console.error('Join squad failed', err);
        alert('Failed to join squad: ' + (err?.message || err));
      } finally {
        this.inviteBox.style.display = 'none';
      }
    };

    this.inviteBox.querySelector('#declineInvite').onclick = () => {
      this.inviteBox.style.display = 'none';
    };
  }

  async _handleGameReady(msg) {
    if (this._joining) return;
    this._joining = true;
    console.log('[WaitingRoom] onGameReady', msg);

    try {
      await networkService.joinGameWithReservation(msg.reservation);
      const profile = profileService.load() || { displayName: 'Pilot' };
      this.scene.start('Game', {
        mode: 'multiplayer',
        profile,
        missionId: msg.missionId || this._selectedMissionId
      });
    } catch (e) {
      console.error('[WaitingRoom] joinGameWithReservation failed', e);
      alert('Failed to join game: ' + (e?.message || e));
      this._joining = false;
      this.panel?.querySelectorAll('button').forEach(b => b.disabled = false);
    }
  }

  _showNotification(text) {
    const el = this.panel?.querySelector('#wrNotification');
    if (!el) return;
    el.textContent = text;
    el.style.display = 'block';
    clearTimeout(this._notifTimeout);
    this._notifTimeout = setTimeout(() => { el.style.display = 'none'; }, 5000);
  }

  _exitToMenu() {
    // Phaser handles DOM cleanup automatically on scene transition
    // Keep socialService WS connected for persistence
    this.scene.start('Menu');
  }

  _escHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  shutdown() {
    // Phaser handles DOM cleanup automatically
    this.panel = null;
    this.panelDom = null;
    this.inviteBox = null;
    this.inviteBoxDom = null;

    // Clear timers
    if (this._notifTimeout) {
      clearTimeout(this._notifTimeout);
      this._notifTimeout = null;
    }

    // Remove keyboard listener
    this.input.keyboard.off('keydown-ESC');

    // Null out callbacks but keep WS connected
    socialService.onSquadUpdate = null;
    socialService.onSquadDisbanded = null;
    socialService.onSquadInvite = null;
    socialService.onGameReady = null;
    socialService.onGameReadyError = null;
    socialService.onFriendRequest = null;
    socialService.onFriendAccepted = null;
    socialService.onFriendOnline = null;
    socialService.onFriendOffline = null;
    socialService.onMatchmakingStatus = null;
  }
}
