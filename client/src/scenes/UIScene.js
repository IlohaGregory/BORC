// UIScene.js
// HUD + input hub with mission objectives, minimap, and priority selector

import { events } from '../core/Events.js';
import { CFG } from '../core/Config.js';
import { TargetPriority, PRIORITY_ORDER } from '../../../shared/targeting.js';
import { ObjectiveStatus } from '../../../shared/missions.js';
import VirtualDPad from '../ui/VirtualDPad.js';
import AimTouchZone from '../ui/AimTouchZone.js';

const PRIORITY_LABELS = {
  [TargetPriority.CLOSEST]: 'NEAR',
  [TargetPriority.LOWEST_HP]: 'WEAK',
  [TargetPriority.HIGHEST_THREAT]: 'THREAT',
  [TargetPriority.CURRENT_AGGRESSOR]: 'AGGRO'
};

export default class UIScene extends Phaser.Scene {
  constructor() {
    super('UI');
  }

  init(data) {
    this.profile = data?.profile || { displayName: 'Pilot' };
    this.missionMode = data?.missionMode ?? false;
  }

  create() {
    const { width, height } = this.scale;

    // HUD - Name and score
    this.nameTxt = this.add.text(4, 2, this.profile.displayName, { fontFamily: 'monospace', fontSize: 14, color: '#7ec8e3' });

    // Score moved to GameScene, but we'll keep event listener
    events.on('score:add', n => {
      // Score updates handled by GameScene now
    });

    // Shared input state
    this.registry.set('input', { vector: { x: 0, y: 0 }, aimHeld: false, aim: null });

    // D-Pad for movement
    this.dpad = new VirtualDPad(this, { size: 60, dead: 0.18, offset: { x: 0, y: 84 } });

    // Aim zone - now only used for tap-to-focus enemies
    this.aimZone = new AimTouchZone(this, {
      exclude: () => {
        const excludes = [];
        // Exclude D-pad area
        if (this.dpad?.isEnabled?.()) {
          const c = this.dpad.getCenter();
          excludes.push({ x: c.x, y: c.y, r: this.dpad.getRadius() });
        }
        // Exclude priority button area
        if (this.priorityBtn) {
          excludes.push({ x: width - 50, y: height - 80, r: 35 });
        }
        return excludes;
      },
      tapMs: 180
    });

    // Priority selector button (bottom right)
    this._createPriorityButton();

    // Minimap (top right) - only in mission mode
    if (this.missionMode) {
      this._createMinimap();
    }

    // Objective HUD (left side) - only in mission mode
    if (this.missionMode) {
      this._createObjectiveHUD();
    }

    // Health bar
    this._createHealthBar();

    // Publish inputs each frame
    this.events.on('update', () => {
      const state = this.registry.get('input');

      const v = this.dpad?.getVector?.() || { x: 0, y: 0 };
      state.vector.x = v.x;
      state.vector.y = v.y;

      // No longer using aim for shooting - auto-fire handles it
      // Taps are handled by GameScene for focus targeting
      state.aimHeld = false;
      state.aim = null;
    });

    // Listen for resize
    this.scale.on('resize', (gameSize) => {
      this._repositionUI(gameSize.width, gameSize.height);
    });
  }

  _createPriorityButton() {
    const { width, height } = this.scale;
    const btnSize = CFG.ui.priorityButtonSize;
    const x = width - 50;
    const y = height - 80;

    // Button background
    this.priorityBg = this.add.graphics();
    this._drawPriorityButton(x, y, btnSize);

    // Button text
    this.priorityText = this.add.text(x, y, PRIORITY_LABELS[TargetPriority.CLOSEST], {
      fontFamily: 'monospace',
      fontSize: 9,
      color: '#fff'
    }).setOrigin(0.5);

    // Make interactive
    this.priorityBtn = this.add.zone(x, y, btnSize + 10, btnSize + 10)
      .setInteractive({ useHandCursor: true });

    this.priorityBtn.on('pointerdown', () => {
      const gameScene = this.scene.get('Game');
      if (gameScene?.cyclePriority) {
        const newPriority = gameScene.cyclePriority();
        this.priorityText.setText(PRIORITY_LABELS[newPriority]);
        this._flashPriorityButton();
      }
    });
  }

  _drawPriorityButton(x, y, size) {
    this.priorityBg.clear();
    this.priorityBg.fillStyle(0x333355, 0.85);
    this.priorityBg.fillCircle(x, y, size / 2);
    this.priorityBg.lineStyle(2, 0x4d73fd, 0.8);
    this.priorityBg.strokeCircle(x, y, size / 2);
  }

  _flashPriorityButton() {
    const { width, height } = this.scale;
    const x = width - 50;
    const y = height - 80;
    const size = CFG.ui.priorityButtonSize;

    // Flash effect
    this.priorityBg.clear();
    this.priorityBg.fillStyle(0x4d73fd, 0.9);
    this.priorityBg.fillCircle(x, y, size / 2);
    this.priorityBg.lineStyle(2, 0xffffff, 1);
    this.priorityBg.strokeCircle(x, y, size / 2);

    this.time.delayedCall(150, () => {
      this._drawPriorityButton(x, y, size);
    });
  }

  _createMinimap() {
    const { width } = this.scale;
    const mapSize = CFG.ui.minimapSize;
    const margin = CFG.ui.minimapMargin;
    const x = width - mapSize - margin;
    const y = margin + 20; // Below score area

    // Minimap container
    this.minimapBg = this.add.graphics();
    this.minimapBg.fillStyle(0x000000, 0.6);
    this.minimapBg.fillRect(x, y, mapSize, mapSize);
    this.minimapBg.lineStyle(1, 0x4d73fd, 0.8);
    this.minimapBg.strokeRect(x, y, mapSize, mapSize);

    // Minimap content graphics
    this.minimapGfx = this.add.graphics();
    this.minimapX = x;
    this.minimapY = y;
    this.minimapSize = mapSize;

    // Update minimap each frame
    this.events.on('update', () => this._updateMinimap());
  }

  _updateMinimap() {
    if (!this.minimapGfx) return;
    this.minimapGfx.clear();

    const gameScene = this.scene.get('Game');
    if (!gameScene?.gameLoop) return;

    const state = gameScene.gameLoop.getState();
    const mapW = state.mapWidth || 600;
    const mapH = state.mapHeight || 800;
    const scale = this.minimapSize / Math.max(mapW, mapH);
    const offsetX = this.minimapX;
    const offsetY = this.minimapY;

    // Draw objectives
    for (const id in state.objectives) {
      const obj = state.objectives[id];
      const mx = offsetX + obj.x * scale;
      const my = offsetY + obj.y * scale;

      if (obj.status === ObjectiveStatus.COMPLETED) {
        this.minimapGfx.fillStyle(0x44ff44, 0.8);
      } else if (obj.isPrimary) {
        this.minimapGfx.fillStyle(0xff4444, 0.9);
      } else {
        this.minimapGfx.fillStyle(0xffaa44, 0.7);
      }
      this.minimapGfx.fillCircle(mx, my, CFG.ui.objectiveMarkerSize);
    }

    // Draw extraction zone
    if (state.mission?.extractionOpen && state.mission?.extractZone) {
      const ez = state.mission.extractZone;
      const mx = offsetX + ez.x * scale;
      const my = offsetY + ez.y * scale;
      this.minimapGfx.lineStyle(2, 0x44ff44, 0.9);
      this.minimapGfx.strokeCircle(mx, my, 10);
    }

    // Draw player
    const local = state.players.local;
    if (local) {
      const px = offsetX + local.x * scale;
      const py = offsetY + local.y * scale;
      this.minimapGfx.fillStyle(0x4d73fd, 1);
      this.minimapGfx.fillCircle(px, py, 4);
    }

    // Draw enemies (simplified)
    let enemyCount = 0;
    for (const id in state.enemies) {
      if (enemyCount > 20) break; // Limit for performance
      const e = state.enemies[id];
      if (!e.alive || e.burrowed) continue;
      const ex = offsetX + e.x * scale;
      const ey = offsetY + e.y * scale;
      this.minimapGfx.fillStyle(0xff6666, 0.6);
      this.minimapGfx.fillCircle(ex, ey, 2);
      enemyCount++;
    }
  }

  _createObjectiveHUD() {
    const { height } = this.scale;

    // Objective list container
    this.objectiveContainer = this.add.container(6, 60);

    // Update objectives each frame
    this.events.on('update', () => this._updateObjectiveHUD());
  }

  _updateObjectiveHUD() {
    if (!this.objectiveContainer) return;
    this.objectiveContainer.removeAll(true);

    const gameScene = this.scene.get('Game');
    if (!gameScene?.gameLoop?.missionMode) return;

    const state = gameScene.gameLoop.getState();
    let yOffset = 0;

    // Show primary objectives
    const primaries = Object.values(state.objectives || {}).filter(o => o.isPrimary);
    for (const obj of primaries) {
      const color = obj.status === ObjectiveStatus.COMPLETED ? '#44ff44' :
                    obj.status === ObjectiveStatus.IN_PROGRESS ? '#ffaa44' : '#ff6666';
      const icon = obj.status === ObjectiveStatus.COMPLETED ? '✓' :
                   obj.status === ObjectiveStatus.IN_PROGRESS ? '◉' : '○';

      const text = this.add.text(0, yOffset, `${icon} ${obj.config?.name || obj.type}`, {
        fontFamily: 'monospace',
        fontSize: 9,
        color
      });
      this.objectiveContainer.add(text);

      // Show progress for in-progress objectives
      if (obj.status === ObjectiveStatus.IN_PROGRESS && obj.progress > 0 && obj.config?.holdTime) {
        const pct = Math.floor((obj.progress / obj.config.holdTime) * 100);
        const progressText = this.add.text(10, yOffset + 10, `${pct}%`, {
          fontFamily: 'monospace',
          fontSize: 8,
          color: '#888'
        });
        this.objectiveContainer.add(progressText);
        yOffset += 12;
      }

      yOffset += 14;
    }

    // Show optional objectives (smaller)
    const optionals = Object.values(state.objectives || {}).filter(o => !o.isPrimary);
    if (optionals.length > 0) {
      yOffset += 4;
      const header = this.add.text(0, yOffset, 'OPTIONAL:', {
        fontFamily: 'monospace',
        fontSize: 7,
        color: '#666'
      });
      this.objectiveContainer.add(header);
      yOffset += 10;

      for (const obj of optionals) {
        const color = obj.status === ObjectiveStatus.COMPLETED ? '#44ff44' : '#888';
        const icon = obj.status === ObjectiveStatus.COMPLETED ? '✓' : '○';
        const text = this.add.text(0, yOffset, `${icon} ${obj.config?.name || obj.type}`, {
          fontFamily: 'monospace',
          fontSize: 8,
          color
        });
        this.objectiveContainer.add(text);
        yOffset += 12;
      }
    }
  }

  _createHealthBar() {
    const { width } = this.scale;

    // Health bar background
    this.healthBg = this.add.graphics();
    this.healthBg.fillStyle(0x333333, 0.7);
    this.healthBg.fillRect(width / 2 - 50, 2, 100, 8);

    // Health bar fill
    this.healthBar = this.add.graphics();

    // Update health each frame
    this.events.on('update', () => this._updateHealthBar());
  }

  _updateHealthBar() {
    if (!this.healthBar) return;
    this.healthBar.clear();

    const gameScene = this.scene.get('Game');
    if (!gameScene) return;

    let hp = CFG.player.hp;
    let maxHp = CFG.player.hp;

    if (gameScene.gameLoop) {
      hp = gameScene.gameLoop.player.hp;
    }

    const pct = Math.max(0, Math.min(1, hp / maxHp));
    const { width } = this.scale;
    const barWidth = 100 * pct;

    // Color based on health
    let color = 0x44ff44;
    if (pct < 0.3) color = 0xff4444;
    else if (pct < 0.6) color = 0xffaa44;

    this.healthBar.fillStyle(color, 0.9);
    this.healthBar.fillRect(width / 2 - 50, 2, barWidth, 8);
  }

  _repositionUI(width, height) {
    // Reposition priority button
    if (this.priorityBg && this.priorityText && this.priorityBtn) {
      const x = width - 50;
      const y = height - 80;
      this._drawPriorityButton(x, y, CFG.ui.priorityButtonSize);
      this.priorityText.setPosition(x, y);
      this.priorityBtn.setPosition(x, y);
    }

    // Reposition minimap
    if (this.minimapBg) {
      const mapSize = CFG.ui.minimapSize;
      const margin = CFG.ui.minimapMargin;
      const x = width - mapSize - margin;
      const y = margin + 20;

      this.minimapBg.clear();
      this.minimapBg.fillStyle(0x000000, 0.6);
      this.minimapBg.fillRect(x, y, mapSize, mapSize);
      this.minimapBg.lineStyle(1, 0x4d73fd, 0.8);
      this.minimapBg.strokeRect(x, y, mapSize, mapSize);

      this.minimapX = x;
      this.minimapY = y;
    }

    // Reposition health bar
    if (this.healthBg) {
      this.healthBg.clear();
      this.healthBg.fillStyle(0x333333, 0.7);
      this.healthBg.fillRect(width / 2 - 50, 2, 100, 8);
    }
  }

  shutdown() {
    // Remove global event listeners
    events.off('score:add');

    // Remove scale resize listener
    this.scale.off('resize');

    // Clean up VirtualDPad
    if (this.dpad) {
      if (this.dpad.destroy) {
        this.dpad.destroy();
      }
      this.dpad = null;
    }

    // Clean up AimTouchZone
    if (this.aimZone) {
      if (this.aimZone.destroy) {
        this.aimZone.destroy();
      }
      this.aimZone = null;
    }

    // Clean up graphics objects
    if (this.priorityBg) {
      this.priorityBg.destroy();
      this.priorityBg = null;
    }
    if (this.priorityText) {
      this.priorityText.destroy();
      this.priorityText = null;
    }
    if (this.priorityBtn) {
      this.priorityBtn.destroy();
      this.priorityBtn = null;
    }
    if (this.minimapBg) {
      this.minimapBg.destroy();
      this.minimapBg = null;
    }
    if (this.minimapGfx) {
      this.minimapGfx.destroy();
      this.minimapGfx = null;
    }
    if (this.objectiveContainer) {
      this.objectiveContainer.destroy();
      this.objectiveContainer = null;
    }
    if (this.healthBg) {
      this.healthBg.destroy();
      this.healthBg = null;
    }
    if (this.healthBar) {
      this.healthBar.destroy();
      this.healthBar = null;
    }
    if (this.nameTxt) {
      this.nameTxt.destroy();
      this.nameTxt = null;
    }
  }
}
