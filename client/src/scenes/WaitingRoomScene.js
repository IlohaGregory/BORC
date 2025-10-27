// client/src/scenes/WaitingRoomScene.js
import Phaser from 'phaser';
import { networkService } from '../services/NetworkService.js';
import { walletService } from '../services/WalletService.js';
import { profileService } from '../services/ProfileService.js';


export default class WaitingRoomScene extends Phaser.Scene {
  constructor(){ super('WaitingRoom'); }

  create() {
    this.cameras.main.setBackgroundColor('#000000');
    this.add.text(160, 10, 'Waiting Room', { fontFamily:'monospace', fontSize:14 }).setOrigin(0.5, 0);

    this.panel = document.createElement('div');
    Object.assign(this.panel.style, { position:'absolute', left:'8px', top:'30px', width:'340px', background:'rgba(0,0,0,0.75)', color:'#fff', padding:'8px', fontFamily:'monospace' });
    document.body.appendChild(this.panel);

    this.infoBar = this.add.text(10, 160, '', { fontFamily:'monospace', fontSize:10, color:'#aaa' });

    // Make a small floating invite box element once
    this.inviteBox = document.createElement('div');
    Object.assign(this.inviteBox.style, {
      position: 'absolute',
      right: '10px',
      top: '30px',
      background: 'rgba(20,20,25,0.95)',
      color: '#fff',
      padding: '8px',
      fontFamily: 'monospace',
      display: 'none',
      zIndex: 9999
    });
    document.body.appendChild(this.inviteBox);

    // Register network callbacks BEFORE connecting to avoid missing messages
    networkService.onInvite = (invite) => {
      // invite: { fromSession, fromAddress, fromName, squadId? }
      console.log('Invite arrived', invite);
      this.inviteBox.innerHTML = `
        <div><strong>Invite from ${invite.fromName || invite.fromAddress || invite.fromSession}</strong></div>
        <div style="margin-top:6px">
          <button id="acceptInvite">Accept</button>
          <button id="declineInvite" style="margin-left:8px">Decline</button>
        </div>`;
      this.inviteBox.style.display = 'block';

      this.inviteBox.querySelector('#acceptInvite').onclick = async () => {
        try {
          // Prefer explicit squadId from invite; otherwise send leaderId fallback
          if (invite.squadId) {
            await networkService.joinSquad(invite.squadId).catch(e => { throw e; });
          } else {
            // server may support join by leader; some server versions expect leaderId instead
            await networkService.joinSquad(null, invite.fromSession).catch(e => { throw e; });
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

    // set service-level callbacks BEFORE connecting so we never race with game_ready
    networkService.onGameReady = (data) => {
      if (this._joining) return;
      this._joining = true;
      console.log('[UI] onGameReady', data);
      // small UX: let user know
      alert('Match ready — joining game...');

      // remove/cleanup lobby UI
      if (this.panel) { this.panel.remove(); this.panel = null; }

      const profile = (typeof profileService !== 'undefined' && profileService.load) ? profileService.load() : { displayName: 'Pilot' };

      this.scene.start('Game', { joinRoomId: data.roomId, profile });
      // this.scene.launch('UI', { profile });
    };

    networkService.onGameReadyError = (err) => {
      console.warn('[UI] joinGame error', err);
      alert('Failed to join game: ' + (err?.message || err));
      // re-enable UI start buttons so the leader can try again
      if (this.panel) {
        this.panel.querySelectorAll('.startSquad').forEach(b => { b.disabled = false; b.textContent = 'Start Match'; });
      }
    };

    // Start connecting AFTER callbacks registered
    this.joinLobbyAndListen();

    // Panel refresh loop
    this.refreshTimer = this.time.addEvent({ delay: 300, loop: true, callback: () => this.refreshPanel() });

    this.input.keyboard.on('keydown-ESC', () => this.exitLobby());

    // instructions to connect
    this.add.text(
      this.scale.width / 2,
      this.scale.height / 2 + 80,
      ` How To Connect With Friends
      NOTE : This is a Proof of Co-op Multiplayer version (no solo plays)), For Solo Plays : https://ilohagregory.github.io/BORC
    1. Parties must be in the lobby to appear in the list of active players
    2. Find friends in the list of active players (search by wallet address, Basenames soon)
    3. Invite another player from the lobby.
    4. When both players squad up all team members should click ready.
    5. Leader (inviter) should click "Start Match" button.
    6. Goodluck Raiders.

    🚀 Built on Base | Multiplayer synced with Colyseus`,
      {
        fontFamily: 'monospace',
        fontSize: 14,
        color: '#ffffff',
        align: 'center',
        wordWrap: { width: this.scale.width * 0.9 },
      }
    ).setOrigin(0.5);

  }

  async joinLobbyAndListen() {
    try {
      await networkService.connectToLobby();

      console.log('Lobby joined:', { roomId: networkService.lobbyRoom?.roomId, sessionId: networkService.lobbyRoom?.sessionId });

      // initial UI refresh
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

    let html = '';
    if (networkService._lastLobbyError) {
      html += `<div style="color:#ff8a8a">Error: ${networkService._lastLobbyError}</div>`;
      networkService._lastLobbyError = null;
    }

    html += `<div>Connected: ${s.players.length} &nbsp; Queue: ${s.queueSize}</div><hr/>`;
    html += '<div><strong>Players</strong></div>';

    s.players.forEach(p => {
      // p: { sessionId, address, baseName, displayName, inSquad, squadId }
      const shortSid = (p.sessionId || '').slice(0, 6);
      const shortAddr = p.address
        ? `${p.address.slice(0, 6)}…${p.address.slice(-4)}`
        : 'Guest';

      const localProfile = profileService?.load?.() || {};
      if (!p.displayName && p.address === walletService.address) {
        p.displayName = localProfile.displayName || '';
      }

      const playerName =
        (p.baseName && p.baseName.trim()) || (localProfile.displayName) ||
        (p.displayName && p.displayName.trim()) ||
        shortAddr;

      html += `<div style="margin:6px 0">`;
      html += `<strong>${playerName}</strong> <span style="font-size:10px;color:#999">(${shortSid})</span>`;

      const lobbySess = networkService.lobbyRoom?.sessionId || null;
      if (p.sessionId && p.sessionId !== lobbySess) {
        html += ` <button data-session="${p.sessionId}" class="inviteBtn" style="margin-left:6px">Invite</button>`;
      }
      html += `</div>`;
    });

    html += '<hr/><div><strong>Squads</strong></div>';
    s.squads.forEach(sq => {
      html += `<div style="margin:6px 0">Squad ${sq.squadId} - leader: ${sq.leader} (${sq.members.length})<br/>`;
      sq.members.forEach(m => {
        const ready = (sq.ready.find ? sq.ready.find(r => r[0] === m)?.[1] : false)
          ? ' (ready)' : '';
        html += `<span style="font-size:12px">${(m || '').slice(0, 6)}${ready}</span> `;
      });
      html += `<br/><button data-join="${sq.squadId}" class="joinSquad">Join</button>`;
      if (sq.leader === (networkService.lobbyRoom?.sessionId || networkService.sessionId)) {
        html += `<button data-start="${sq.squadId}" class="startSquad" style="margin-left:6px">Start Match</button>`;
      } else {
        html += `<button disabled style="margin-left:6px">Waiting</button>`;
      }
      html += `</div>`;
    });

    html += '<hr/>';
    html += `<div style="display:flex;gap:8px">
      <button id="readyBtn">Ready</button>
      <button id="matchBtn">Start</button>
      <input id="roomInput" placeholder="Join squad id" style="padding:6px;font-family:monospace"/>
    </div>`;

    this.panel.innerHTML = html;

    // Reconnect buttons
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

    this.panel.querySelectorAll('.startSquad').forEach(btn => {
      btn.onclick = async () => {
        this.panel.querySelectorAll('.startSquad').forEach(b => {
          b.disabled = true;
          b.textContent = 'Starting...';
        });

        try {
          await networkService.startMatchAsLeader(btn.dataset.start);
        } catch (e) {
          console.error('startMatch error', e);
          this.panel.querySelectorAll('.startSquad').forEach(b => {
            b.disabled = false;
            b.textContent = 'Start Match';
          });
          alert('Start failed: ' + (e?.message || e));
        }
      };
    });
  }

  exitLobby() {
    // fire and forget leave
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
