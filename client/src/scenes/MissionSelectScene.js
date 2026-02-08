// MissionSelectScene.js
// Mission picker UI showing available missions with difficulty and objectives preview

import Phaser from 'phaser';
import { getMissionList, getMission, OBJECTIVE_CONFIG } from '../../../shared/missions.js';

export default class MissionSelectScene extends Phaser.Scene {
  constructor() {
    super('MissionSelect');
  }

  init(data) {
    this.mode = data?.mode || 'solo';
    this.profile = data?.profile || { displayName: 'Pilot' };
    this.squadId = data?.squadId || null;
    this.selectedMissionId = null;
  }

  create() {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#0a0a12');

    // Title
    this.add.text(width / 2, 30, 'SELECT MISSION', {
      fontFamily: 'monospace',
      fontSize: 20,
      color: '#4d73fd'
    }).setOrigin(0.5);

    // Mission list container (DOM element for scrolling)
    this.panel = document.createElement('div');
    Object.assign(this.panel.style, {
      width: `${width - 20}px`,
      maxHeight: `${height - 140}px`,
      overflowY: 'auto',
      background: 'transparent',
      fontFamily: 'monospace'
    });
    // Use Phaser DOM system - position top-left with offset
    this.panelDom = this.add.dom(10, 60, this.panel).setOrigin(0, 0).setScrollFactor(0);

    this._buildMissionList();

    // Bottom buttons
    this.add.text(width / 2, height - 60, 'TAP A MISSION TO SELECT', {
      fontFamily: 'monospace',
      fontSize: 10,
      color: '#666'
    }).setOrigin(0.5);

    // Start button (hidden until mission selected)
    this.startBtnEl = document.createElement('button');
    Object.assign(this.startBtnEl.style, {
      padding: '12px 32px',
      fontSize: '16px',
      fontFamily: 'monospace',
      background: '#4d73fd',
      color: '#fff',
      border: 'none',
      borderRadius: '6px',
      cursor: 'pointer',
      display: 'none'
    });
    this.startBtnEl.textContent = 'START MISSION';
    this.startBtnEl.onclick = () => this._startMission();
    // Use Phaser DOM system - position bottom center
    this.startBtnDom = this.add.dom(width / 2, height - 20, this.startBtnEl).setOrigin(0.5, 1).setScrollFactor(0);

    // Back button
    this.backBtnEl = document.createElement('button');
    Object.assign(this.backBtnEl.style, {
      padding: '8px 16px',
      fontSize: '12px',
      fontFamily: 'monospace',
      background: '#333',
      color: '#fff',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer'
    });
    this.backBtnEl.textContent = 'BACK';
    this.backBtnEl.onclick = () => {
      this.scene.start('WaitingRoom', { walletConnected: true });
    };
    // Use Phaser DOM system - position bottom-left
    this.backBtnDom = this.add.dom(10, height - 20, this.backBtnEl).setOrigin(0, 1).setScrollFactor(0);

    // ESC to go back
    this.input.keyboard.on('keydown-ESC', () => {
      this.scene.start('WaitingRoom', { walletConnected: true });
    });
  }

  _buildMissionList() {
    const missions = getMissionList();

    this.panel.innerHTML = missions.map(m => {
      const stars = '★'.repeat(m.difficulty) + '☆'.repeat(3 - m.difficulty);
      const mission = getMission(m.id);
      const objectives = mission.primaryObjectives.map(o => {
        const config = OBJECTIVE_CONFIG[o.type];
        return config?.name || o.type;
      }).join(', ');

      return `
        <div class="mission-card" data-id="${m.id}" style="
          margin-bottom: 10px;
          padding: 12px;
          background: rgba(30, 30, 50, 0.9);
          border: 2px solid #333;
          border-radius: 8px;
          cursor: pointer;
          transition: border-color 0.2s;
        ">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span style="font-size: 14px; color: #fff; font-weight: bold;">${m.name}</span>
            <span style="font-size: 12px; color: #ffd700;">${stars}</span>
          </div>
          <div style="font-size: 11px; color: #aaa; margin-bottom: 6px;">${m.description}</div>
          <div style="font-size: 10px; color: #666;">
            <span style="color: #4d73fd;">Objectives:</span> ${objectives}
          </div>
          ${mission.optionalObjectives.length > 0 ? `
            <div style="font-size: 9px; color: #555; margin-top: 4px;">
              +${mission.optionalObjectives.length} optional
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    // Wire up click handlers
    this.panel.querySelectorAll('.mission-card').forEach(card => {
      card.addEventListener('click', () => {
        // Deselect previous
        this.panel.querySelectorAll('.mission-card').forEach(c => {
          c.style.borderColor = '#333';
        });
        // Select this one
        card.style.borderColor = '#4d73fd';
        this.selectedMissionId = card.dataset.id;
        this.startBtnEl.style.display = 'block';
      });

      card.addEventListener('mouseenter', () => {
        if (card.dataset.id !== this.selectedMissionId) {
          card.style.borderColor = '#555';
        }
      });

      card.addEventListener('mouseleave', () => {
        if (card.dataset.id !== this.selectedMissionId) {
          card.style.borderColor = '#333';
        }
      });
    });
  }

  _startMission() {
    if (!this.selectedMissionId) return;

    this.startBtnEl.disabled = true;
    this.startBtnEl.textContent = 'LAUNCHING...';

    // Transition to game with mission
    this.scene.start('Game', {
      mode: this.mode,
      profile: this.profile,
      missionId: this.selectedMissionId,
      squadId: this.squadId
    });
  }

  shutdown() {
    // Phaser handles DOM cleanup automatically
    this.panel = null;
    this.panelDom = null;
    this.startBtnEl = null;
    this.startBtnDom = null;
    this.backBtnEl = null;
    this.backBtnDom = null;

    // Remove keyboard listener
    this.input.keyboard.off('keydown-ESC');
  }
}
