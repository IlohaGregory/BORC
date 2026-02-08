/**
 * GameOverScene — post-run results. Shows mission outcome and returns to appropriate screen.
 */
import { walletService } from '../services/WalletService.js';
import { MissionStatus, getMission } from '../../../shared/missions.js';

export default class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOver');
  }

  init(data) {
    this._score = data?.score || 0;
    this._wave = data?.wave || 0;
    this._mode = data?.mode || 'solo';
    this._profile = data?.profile || { displayName: 'Pilot' };
    this._missionId = data?.missionId || null;
    this._missionStatus = data?.missionStatus || null;
    this._objectives = data?.objectives || [];
  }

  create() {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#0a0a12');

    // Mission result title
    let title = 'MISSION FAILED';
    let titleColor = '#ff6a6a';

    if (this._missionStatus === MissionStatus.COMPLETED) {
      title = 'MISSION COMPLETE';
      titleColor = '#44ff44';
    } else if (this._missionStatus === MissionStatus.FAILED) {
      title = 'MISSION FAILED';
      titleColor = '#ff6a6a';
    } else if (this._wave > 0) {
      title = 'GAME OVER';
      titleColor = '#ff6a6a';
    }

    this.add.text(width / 2, height / 3 - 20, title, {
      fontFamily: 'monospace',
      fontSize: 20,
      color: titleColor
    }).setOrigin(0.5);

    // Mission name if applicable
    if (this._missionId) {
      const mission = getMission(this._missionId);
      if (mission) {
        this.add.text(width / 2, height / 3 + 10, mission.name, {
          fontFamily: 'monospace',
          fontSize: 12,
          color: '#4d73fd'
        }).setOrigin(0.5);
      }
    }

    // Score display
    let scoreText = `Score: ${Math.floor(this._score)}`;
    if (this._wave > 0) {
      scoreText += `  |  Wave: ${this._wave}`;
    }

    this.add.text(width / 2, height / 2 - 10, scoreText, {
      fontFamily: 'monospace',
      fontSize: 14,
      color: '#fff'
    }).setOrigin(0.5);

    // Objectives summary (if mission mode)
    if (this._objectives && this._objectives.length > 0) {
      let yOffset = height / 2 + 15;

      this.add.text(width / 2, yOffset, 'Objectives:', {
        fontFamily: 'monospace',
        fontSize: 10,
        color: '#888'
      }).setOrigin(0.5);

      yOffset += 14;

      for (const obj of this._objectives) {
        const completed = obj.status === 'completed';
        const icon = completed ? '✓' : '✗';
        const color = completed ? '#44ff44' : '#ff6666';
        const name = obj.config?.name || obj.type;

        this.add.text(width / 2, yOffset, `${icon} ${name}`, {
          fontFamily: 'monospace',
          fontSize: 9,
          color
        }).setOrigin(0.5);

        yOffset += 12;
      }
    }

    // Buttons
    const btnY = height - 50;

    // Play Again button - goes to mission select or waiting room
    const againBtn = this.add.text(width / 2, btnY, 'Play Again', {
      fontFamily: 'monospace',
      fontSize: 14,
      color: '#7ec8e3',
      backgroundColor: '#1a1a2e',
      padding: { x: 16, y: 8 }
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    againBtn.on('pointerover', () => againBtn.setColor('#ffffff'));
    againBtn.on('pointerout', () => againBtn.setColor('#7ec8e3'));
    againBtn.on('pointerdown', () => {
      if (this._missionId) {
        // Go back to mission select
        this.scene.start('MissionSelect', {
          mode: this._mode,
          profile: this._profile
        });
      } else {
        // Legacy wave mode - go to waiting room
        this.scene.start('WaitingRoom', {
          fromGameOver: true,
          mode: this._mode,
          walletConnected: walletService.isConnected()
        });
      }
    });

    // Menu button
    const menuBtn = this.add.text(width / 2, btnY + 30, 'Main Menu', {
      fontFamily: 'monospace',
      fontSize: 10,
      color: '#666'
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    menuBtn.on('pointerover', () => menuBtn.setColor('#aaa'));
    menuBtn.on('pointerout', () => menuBtn.setColor('#666'));
    menuBtn.on('pointerdown', () => {
      this.scene.start('Menu');
    });

    // Auto-return after delay
    this._autoReturnTimer = this.time.delayedCall(15000, () => {
      if (this.scene.isActive('GameOver')) {
        this.scene.start('WaitingRoom', {
          fromGameOver: true,
          mode: this._mode,
          walletConnected: walletService.isConnected()
        });
      }
    });
  }

  shutdown() {
    // Cancel auto-return timer if scene exits early
    if (this._autoReturnTimer) {
      this._autoReturnTimer.remove(false);
      this._autoReturnTimer = null;
    }
  }
}
