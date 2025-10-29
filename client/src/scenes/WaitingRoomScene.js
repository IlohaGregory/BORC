// client/src/scenes/WaitingRoomScene.js
import Phaser from 'phaser';
import { networkService } from '../services/NetworkService.js';
import { walletService } from '../services/WalletService.js';
import { profileService } from '../services/ProfileService.js';

export default class WaitingRoomScene extends Phaser.Scene {
  constructor(){ super('WaitingRoom'); }

  init(data) {
    if (data?.profile) {
      profileService.save(data.profile);
    }
  }

  create() {
    this.cameras.main.setBackgroundColor('#000000');
    this.add.text(this.scale.width/2, 10, 'Waiting Room', { fontFamily:'monospace', fontSize:16 }).setOrigin(0.5, 0);

    // floating left panel
    this.panel = document.createElement('div');
    Object.assign(this.panel.style, {
      position:'absolute',
      left:'8px',
      top:'36px',
      width:'360px',
      background:'rgba(0,0,0,0.82)',
      color:'#fff',
      padding:'10px',
      fontFamily:'monospace',
      borderRadius:'6px',
      boxSizing:'border-box'
    });
    document.body.appendChild(this.panel);

    // info bar (phaser text)
    this.infoBar = this.add.text(10, 170, '', { fontFamily:'monospace', fontSize:11, color:'#aaa' });

    // invite box (floating)
    this.inviteBox = document.createElement('div');
    Object.assign(this.inviteBox.style, {
      position: 'absolute',
      right: '10px',
      top: '30px',
      background: 'rgba(20,20,25,0.98)',
      color: '#fff',
      padding: '12px',
      fontFamily: 'monospace',
      display: 'none',
      zIndex: 9999,
      borderRadius: '8px',
      maxWidth: '320px'
    });
    document.body.appendChild(this.inviteBox);

    // Register invite handler
    networkService.onInvite = (invite) => {
      // invite: { fromSession, fromAddress, fromName, squadId? }
      console.log('Invite arrived', invite);
      const fromName = invite.fromName || invite.fromAddress || invite.fromSession;
      this.inviteBox.innerHTML = `
        <div style="font-size:14px"><strong>🎯 Invite from ${fromName}</strong></div>
        <div style="margin-top:8px;color:#ddd;font-size:12px">Join ${fromName}'s squad?</div>
        <div style="margin-top:10px;display:flex;gap:8px">
          <button id="acceptInvite">✅ Accept</button>
          <button id="declineInvite">❌ Decline</button>
        </div>
      `;
      this.inviteBox.style.display = 'block';

      this.inviteBox.querySelector('#acceptInvite').onclick = async () => {
        try {
          if (invite.squadId) {
            await networkService.joinSquad(invite.squadId);
          } else {
            await networkService.joinSquad(null, invite.fromSession);
          }
        } catch (err) {
          console.error('joinSquad failed', err);
          alert('Failed to join squad: ' + (err?.message || err));
        } finally {
          this.inviteBox.style.display = 'none';
        }
      };

      this.inviteBox.querySelector('#declineInvite').onclick = () => {
        this.inviteBox.style.display = 'none';
      };
    };

    // game ready callbacks
    networkService.onGameReady = (data) => {
      if (this._joining) return;
      this._joining = true;
      console.log('[UI] onGameReady', data);
      alert('Match ready — joining game...');
      if (this.panel) { this.panel.remove(); this.panel = null; }
      const profile = (typeof profileService !== 'undefined' && profileService.load) ? profileService.load() : { displayName: 'Pilot' };
      this.scene.start('Game', { joinRoomId: data.roomId, profile });
    };

    networkService.onGameReadyError = (err) => {
      console.warn('[UI] joinGame error', err);
      alert('Failed to join game: ' + (err?.message || err));
      // re-enable start buttons if present
      if (this.panel) this.panel.querySelectorAll('button').forEach(b => b.disabled = false);
    };

    // Start connecting AFTER callbacks registered
    this.joinLobbyAndListen();

    // refresh loop
    this.refreshTimer = this.time.addEvent({ delay: 400, loop: true, callback: () => this.refreshPanel() });

    this.input.keyboard.on('keydown-ESC', () => this.exitLobby());

    // helpful instructions below
    this.add.text(
      this.scale.width / 2,
      this.scale.height / 2 + 88,
      `How To Connect With Friends
      NOTE: This is a proof of multiplayer and Base integration version; For solo play head to https://ilohagregory.github.io/BORC/
1) look for friends on player list (search by wallet; basenames and display name soon)
2) Send invites
3) Wait for invites to be accepted
4) Squad leader clicks Start, members click Ready (leader auto-ready)
`,
      {
        fontFamily: 'monospace',
        fontSize: 12,
        color: '#ddd',
        align: 'center',
        wordWrap: { width: this.scale.width * 0.9 },
      }
    ).setOrigin(0.5);
  }

  async joinLobbyAndListen() {
    try {
      await networkService.connectToLobby();
      console.log('Lobby joined:', { roomId: networkService.lobbyRoom?.roomId, sessionId: networkService.lobbyRoom?.sessionId });
      this.refreshPanel();
    } catch (e) {
      console.error('lobby join failed', e);
      if (this.panel) this.panel.innerText = 'Lobby join failed: ' + (e.message || e);
    }
  }

  refreshPanel() {
    const s = networkService.lobbyState;
    if (!s) {
      this.panel.innerHTML = '<div>Waiting for lobby data…</div>';
      return;
    }

    // 🔹 Cache for auto-ready leader (prevent spamming setReady)
    if (!this._autoReadyFlag) this._autoReadyFlag = {};

    // --- Helper for consistent player naming ---
    const getDisplayName = (player) => {
      if (!player) return 'Unknown';

      const shortAddr = player.address
        ? `${player.address.slice(0, 6)}…${player.address.slice(-4)}`
        : 'Guest';

      const myAddr = walletService.getAddress?.()?.toLowerCase();
      const isMe = myAddr && player.address && player.address.toLowerCase() === myAddr;

      // For YOU: prefer local baseName > displayName
      if (isMe) {
        const localProfile = profileService.load();
        const localName = localProfile?.baseName || localProfile?.displayName;
        if (localName) return localName;
      }

      // For others: baseName (from server) > displayName > shortAddr
      return (
        (player.baseName && player.baseName.trim()) ||
        (player.displayName && player.displayName.trim()) ||
        shortAddr
      );
    };

    const mySessionId = networkService.lobbyRoom?.sessionId || networkService.sessionId;
    const me = s.players.find(p => p.sessionId === mySessionId);
    const myName = getDisplayName(me);

    let html = `<div style="margin-bottom:8px; color:#90ee90;">
      👤 You are <strong>${myName}</strong>
    </div>`;

    if (networkService._lastLobbyError) {
      html += `<div style="color:#ff8a8a">Error: ${networkService._lastLobbyError}</div>`;
      networkService._lastLobbyError = null;
    }

    html += `<div>Connected: ${s.players.length} &nbsp; Queue: ${s.queueSize}</div><hr/>`;
    html += '<div><strong>Players</strong></div>';

    // --- Player list ---
    s.players.forEach(p => {
      const shortSid = (p.sessionId || '').slice(0, 6);
      const playerName = getDisplayName(p);
      html += `<div style="margin:6px 0">`;
      html += `<strong>${playerName}</strong> <span style="font-size:10px;color:#999">(${shortSid})</span>`;
      if (p.sessionId && p.sessionId !== mySessionId) {
        html += ` <button data-session="${p.sessionId}" class="inviteBtn" style="margin-left:6px">Invite</button>`;
      }
      html += `</div>`;
    });

    // --- Squads section ---
    html += '<hr/><div><strong>Squads</strong></div>';
    s.squads.forEach(sq => {
      const isLeader = sq.leader === mySessionId;

      // === NEW: convert serialized ready array to Map ===
      const readyMap = new Map(sq.ready);   // <-- ADD THIS LINE

      // Auto-set leader ready once per squad (client-side safety net)
      if (isLeader && !this._autoReadyFlag[sq.squadId]) {
        this._autoReadyFlag[sq.squadId] = true;
        networkService
          .setReady(sq.squadId, true)
          .catch(err => console.warn('auto-ready leader failed', err));
      }

      const leaderPlayer = s.players.find(p => p.sessionId === sq.leader);
      html += `<div style="margin:6px 0; padding:6px; background:rgba(255,255,255,0.05); border-radius:4px;">
        <div>Target Squad ${sq.squadId} - Leader: <strong>${getDisplayName(leaderPlayer)}</strong> (${sq.members.length})</div>
        <div style="margin-top:4px">`;

      sq.members.forEach(m => {
        const member = s.players.find(p => p.sessionId === m);
        // === NEW: use readyMap instead of sq.ready.find ===
        const ready = readyMap.get(m) ?? false;   // <-- CHANGE THIS LINE
        const name = getDisplayName(member);
        html += `<span style="font-size:12px">${name}${ready ? ' Ready' : ' <span style="color:#ff7070">(not ready)</span>'}</span><br/>`;
      });

      html += `</div>`;

      // Show join button only for other squads
      const isInThisSquad = sq.members.includes(mySessionId);
      if (!isInThisSquad) {
        html += `<button data-join="${sq.squadId}" class="joinSquad">Join</button>`;
      }

      html += `</div>`;
    });

    // --- Controls ---
    html += '<hr/><div style="display:flex;gap:8px">';
    const mySquad = s.squads.find(sq => sq.members.includes(mySessionId));
    const isLeader = mySquad?.leader === mySessionId;

    // Ready button only for non-leaders in a squad
    if (mySquad && !isLeader) {
      const readyMap = new Map(mySquad.ready);
      const amReady = readyMap.get(mySessionId) ?? false;
      html += `<button id="readyBtn">${amReady ? 'Unready' : 'Ready'}</button>`;
    }

    // Unfied Start button:
    // - Solo player → matchmaking
    // - Squad leader → start squad matchi
    if (!mySquad || isLeader) {
      const color = isLeader ? '#3ae374' : '#fff';
      html += `<button id="matchBtn" style="background:${color};padding:6px 10px;border:none;border-radius:4px;">Start</button>`;
    }

    html += '</div>';

    this.panel.innerHTML = html;

    // --- Wire up buttons ---
    this.panel.querySelectorAll('.inviteBtn').forEach(btn => {
      btn.onclick = () => {
        const targetSession = btn.dataset.session;
        networkService.sendInvite({ toSessionId: targetSession })
          .catch(e => console.error('invite failed', e));
      };
    });

    this.panel.querySelectorAll('.joinSquad').forEach(btn => {
      btn.onclick = () => networkService.joinSquad(btn.dataset.join)
        .catch(e => console.error('joinSquad err', e));
    });

    // Unified Start button
    const matchBtn = this.panel.querySelector('#matchBtn');
    if (matchBtn) {
      matchBtn.onclick = async () => {
        matchBtn.disabled = true;
        matchBtn.textContent = 'Starting...';
        try {
          if (mySquad && isLeader) {
            await networkService.startMatchAsLeader(mySquad.squadId);
          } else {
            await networkService.startMatchmaking();
          }
        } catch (e) {
          console.error('Start failed', e);
          alert('Start failed: ' + (e?.message || e));
        } finally {
          matchBtn.disabled = false;
          matchBtn.textContent = 'Start';
        }
      };
    }

    // Ready button
    const readyBtn = this.panel.querySelector('#readyBtn');
    if (readyBtn) {
      readyBtn.onclick = async () => {
        if (!mySquad) return alert('Not in a squad');
        const sq = s.squads.find(x => x.squadId === mySquad.squadId);
        const amReady = sq?.ready?.find ? sq.ready.find(r => r[0] === mySessionId)?.[1] : false;
        await networkService.setReady(mySquad.squadId, !amReady).catch(e => console.error('setReady err', e));
      };
    }
  }


  exitLobby() {
    networkService.leaveLobby().catch(e => console.warn('leaveLobby err', e));
    if (this.panel) { this.panel.remove(); this.panel = null; }
    this.scene.start('Menu');
  }

  shutdown() {
    if (this.panel) { this.panel.remove(); this.panel = null; }
    if (this.inviteBox) { this.inviteBox.remove(); this.inviteBox = null; }
    this.refreshTimer?.destroy();
    networkService.onGameReady = null;
    networkService.onGameReadyError = null;
    networkService.onInvite = null;
  }
}
