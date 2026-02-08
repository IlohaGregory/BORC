// DifficultySelectScene.js
// Difficulty selection UI with 3 tiers: Easy, Medium, Hard

import Phaser from 'phaser';
import { networkService } from '../services/NetworkService.js';
import { walletService } from '../services/WalletService.js';

/**
 * Client-side difficulty configuration for display purposes.
 * Server has authoritative DIFFICULTY_CONFIG in MissionGenerator.js
 */
const DIFFICULTY_CONFIG = {
  1: {
    name: 'Easy',
    stars: 1,
    description: 'A straightforward operation. Good for beginners.',
    estimatedTime: '3-5 min',
    color: '#3ae374',
    objectives: '1 objective'
  },
  2: {
    name: 'Medium',
    stars: 2,
    description: 'A challenging mission with multiple objectives.',
    estimatedTime: '5-8 min',
    color: '#ffd700',
    objectives: '1-2 objectives'
  },
  3: {
    name: 'Hard',
    stars: 3,
    description: 'High-intensity combat. Extraction will be difficult.',
    estimatedTime: '8-12 min',
    color: '#ff6b6b',
    objectives: '2-3 objectives'
  }
};

export default class DifficultySelectScene extends Phaser.Scene {
  constructor() {
    super('DifficultySelect');
  }

  init(data) {
    this.mode = data?.mode || 'solo';
    this.profile = data?.profile || { displayName: 'Pilot' };
    this.squadId = data?.squadId || null;
    this._starting = false;
  }

  create() {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#0a0a12');

    // Title
    this.add.text(width / 2, 24, 'SELECT DIFFICULTY', {
      fontFamily: 'monospace',
      fontSize: 18,
      color: '#4d73fd'
    }).setOrigin(0.5);

    // Difficulty cards container (DOM element)
    this.panel = document.createElement('div');
    const panelWidth = Math.min(width - 20, 600);
    Object.assign(this.panel.style, {
      width: `${panelWidth}px`,
      maxHeight: `${height - 120}px`,
      overflowY: 'auto',
      background: 'transparent',
      fontFamily: 'monospace',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      alignItems: 'center'
    });
    // Use Phaser DOM system - center horizontally, position below title
    this.panelDom = this.add.dom(width / 2, 55, this.panel).setOrigin(0.5, 0).setScrollFactor(0);

    this._buildDifficultyCards();

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
    this.backBtnEl.onclick = () => this._goBack();
    // Use Phaser DOM system - position bottom-left
    this.backBtnDom = this.add.dom(10, height - 16, this.backBtnEl).setOrigin(0, 1).setScrollFactor(0);

    // ESC to go back
    this.input.keyboard.on('keydown-ESC', () => this._goBack());
  }

  _buildDifficultyCards() {
    // Clear existing cards
    this.panel.innerHTML = '';

    // Create cards for each difficulty
    [1, 2, 3].forEach(difficulty => {
      const config = DIFFICULTY_CONFIG[difficulty];
      const stars = this._getStarsHTML(config.stars);

      const card = document.createElement('div');
      card.className = 'difficulty-card';
      card.dataset.difficulty = difficulty;

      Object.assign(card.style, {
        width: '100%',
        maxWidth: '320px',
        padding: '16px',
        background: 'rgba(30, 30, 50, 0.95)',
        border: `2px solid ${config.color}40`,
        borderRadius: '10px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        boxSizing: 'border-box'
      });

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span style="font-size: 16px; font-weight: bold; color: ${config.color};">${config.name}</span>
          <span style="font-size: 14px; color: #ffd700;">${stars}</span>
        </div>
        <div style="font-size: 11px; color: #bbb; margin-bottom: 10px; line-height: 1.4;">
          ${config.description}
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 10px; color: #777;">
          <span>${config.objectives}</span>
          <span>${config.estimatedTime}</span>
        </div>
      `;

      // Hover effects
      card.addEventListener('mouseenter', () => {
        if (!this._starting) {
          card.style.borderColor = config.color;
          card.style.transform = 'scale(1.02)';
        }
      });

      card.addEventListener('mouseleave', () => {
        if (!this._starting) {
          card.style.borderColor = `${config.color}40`;
          card.style.transform = 'scale(1)';
        }
      });

      // Click handler
      card.addEventListener('click', () => {
        if (!this._starting) {
          this._selectDifficulty(difficulty);
        }
      });

      this.panel.appendChild(card);
    });
  }

  _getStarsHTML(count) {
    return '<span style="letter-spacing: 2px;">' +
      '<span style="color: #ffd700;">' + '\u2605'.repeat(count) + '</span>' +
      '<span style="color: #444;">' + '\u2606'.repeat(3 - count) + '</span>' +
      '</span>';
  }

  async _selectDifficulty(difficulty) {
    if (this._starting) return;
    this._starting = true;

    // Visual feedback - highlight selected card
    const cards = this.panel.querySelectorAll('.difficulty-card');
    cards.forEach(card => {
      if (parseInt(card.dataset.difficulty) === difficulty) {
        card.style.borderColor = DIFFICULTY_CONFIG[difficulty].color;
        card.style.background = 'rgba(50, 50, 80, 0.95)';
        card.innerHTML += '<div style="text-align: center; margin-top: 10px; font-size: 12px; color: #4d73fd;">LAUNCHING...</div>';
      } else {
        card.style.opacity = '0.5';
        card.style.cursor = 'default';
      }
    });

    if (this.backBtnEl) {
      this.backBtnEl.disabled = true;
      this.backBtnEl.style.opacity = '0.5';
    }

    // Start the game with selected difficulty
    this.scene.start('Game', {
      mode: this.mode,
      profile: this.profile,
      difficulty: difficulty,
      squadId: this.squadId
    });
  }

  _goBack() {
    if (this._starting) return;
    this.scene.start('WaitingRoom', { walletConnected: walletService.isConnected() });
  }

  shutdown() {
    // Phaser handles DOM cleanup automatically
    this.panel = null;
    this.panelDom = null;
    this.backBtnEl = null;
    this.backBtnDom = null;

    // Remove keyboard listener
    this.input.keyboard.off('keydown-ESC');

    // Reset state
    this._starting = false;
  }
}
