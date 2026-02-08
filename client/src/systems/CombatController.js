// CombatController.js
// Auto-fire system with priority targeting and focus-fire mechanics

import { CFG, TargetPriority, PRIORITY_ORDER } from '../core/Config.js';
import { selectTarget, findFocusTarget } from '../../../shared/targeting.js';

export default class CombatController {
  constructor(scene) {
    this.scene = scene;
    this.priority = TargetPriority.CLOSEST;
    this.focusTargetId = null;
    this.currentTarget = null;
    this._lastFireTime = 0;
    this._lastAttackedBy = null;

    // Focus indicator graphics
    this.focusIndicator = null;
    this._createFocusIndicator();

    // Listen for tap-to-focus events
    this._setupTapFocus();
  }

  _createFocusIndicator() {
    this.focusIndicator = this.scene.add.graphics();
    this.focusIndicator.setDepth(5);
  }

  _setupTapFocus() {
    // Listen for enemy taps in the game scene
    this.scene.input.on('pointerdown', (pointer) => {
      // Convert screen to world coords
      const worldPoint = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const tappedEnemy = this._findEnemyAtPoint(worldPoint.x, worldPoint.y);

      if (tappedEnemy) {
        this.setFocus(tappedEnemy.id);
      } else {
        // Tap on empty space clears focus
        this.clearFocus();
      }
    });
  }

  _findEnemyAtPoint(x, y) {
    const enemies = this._getEnemyList();
    const tapRadius = 20; // Generous tap area

    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const dist = Math.hypot(enemy.x - x, enemy.y - y);
      if (dist <= tapRadius) {
        return enemy;
      }
    }
    return null;
  }

  _getEnemyList() {
    // Get enemies from scene's game state
    if (this.scene.gameLoop) {
      // Solo mode
      return Object.values(this.scene.gameLoop.enemies || {});
    } else if (this.scene.netSync) {
      // Multiplayer mode - get from latest state
      const state = this.scene.netSync.getLatestState?.() || {};
      return Object.entries(state.enemies || {}).map(([id, e]) => ({ id, ...e }));
    }
    return [];
  }

  _getPlayerState() {
    if (this.scene.gameLoop) {
      return {
        x: this.scene.gameLoop.player.x,
        y: this.scene.gameLoop.player.y,
        lastAttackedBy: this._lastAttackedBy
      };
    } else if (this.scene.player) {
      return {
        x: this.scene.player.x,
        y: this.scene.player.y,
        lastAttackedBy: this._lastAttackedBy
      };
    }
    return { x: 0, y: 0, lastAttackedBy: null };
  }

  setFocus(enemyId) {
    this.focusTargetId = enemyId;
  }

  clearFocus() {
    this.focusTargetId = null;
    this.currentTarget = null;
  }

  cyclePriority() {
    const idx = PRIORITY_ORDER.indexOf(this.priority);
    const nextIdx = (idx + 1) % PRIORITY_ORDER.length;
    this.priority = PRIORITY_ORDER[nextIdx];
    return this.priority;
  }

  setPriority(priority) {
    if (PRIORITY_ORDER.includes(priority)) {
      this.priority = priority;
    }
  }

  getPriority() {
    return this.priority;
  }

  // Called when player takes damage - record attacker
  onPlayerDamaged(attackerId) {
    this._lastAttackedBy = attackerId;
  }

  /**
   * Main update - called each frame
   * Returns { target, shouldFire, aimX, aimY } or null
   */
  update(time) {
    const enemies = this._getEnemyList();
    const player = this._getPlayerState();
    const range = CFG.combat.autoFireRange;

    // Control hierarchy: Focus > Priority > Default
    let target = null;

    // 1. Check focus target first
    if (this.focusTargetId) {
      target = findFocusTarget(enemies, this.focusTargetId);
      if (!target) {
        // Focus target died, clear focus
        this.focusTargetId = null;
      }
    }

    // 2. If no focus, use priority targeting
    if (!target) {
      target = selectTarget(player, enemies, this.priority, range);
    }

    this.currentTarget = target;

    // Update focus indicator
    this._updateFocusIndicator();

    // Check if we should fire
    if (!target) {
      return null;
    }

    const cooldown = CFG.combat.autoFireCooldownMs;
    const now = time || performance.now();
    const shouldFire = (now - this._lastFireTime) >= cooldown;

    if (shouldFire) {
      this._lastFireTime = now;
    }

    return {
      target,
      shouldFire,
      aimX: target.x,
      aimY: target.y
    };
  }

  _updateFocusIndicator() {
    this.focusIndicator.clear();

    if (!this.currentTarget) return;

    const target = this.currentTarget;
    const isFocused = this.focusTargetId === target.id;

    // Draw targeting ring
    const radius = 12;
    const alpha = isFocused ? 0.9 : 0.5;
    const color = isFocused ? 0xff4444 : 0xffff44;

    this.focusIndicator.lineStyle(2, color, alpha);
    this.focusIndicator.strokeCircle(target.x, target.y, radius);

    if (isFocused) {
      // Draw crosshair on focused target
      const crossSize = 6;
      this.focusIndicator.lineStyle(1, 0xff4444, 0.8);
      this.focusIndicator.beginPath();
      this.focusIndicator.moveTo(target.x - crossSize, target.y);
      this.focusIndicator.lineTo(target.x + crossSize, target.y);
      this.focusIndicator.moveTo(target.x, target.y - crossSize);
      this.focusIndicator.lineTo(target.x, target.y + crossSize);
      this.focusIndicator.strokePath();
    }
  }

  getCurrentTarget() {
    return this.currentTarget;
  }

  getFocusTargetId() {
    return this.focusTargetId;
  }

  destroy() {
    if (this.focusIndicator) {
      this.focusIndicator.destroy();
    }
  }
}
