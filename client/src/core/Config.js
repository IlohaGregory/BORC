// Re-export shared definitions for client convenience
export { EnemyType, ENEMY_STATS, ObjectiveType, MISSIONS } from '../../../shared/missions.js';
export { TargetPriority, PRIORITY_ORDER } from '../../../shared/targeting.js';

export const CFG = {
  // Player settings
  player: {
    speed: 80,             // Movement speed in pixels/sec
    hp: 20,                // Hit points
    iFramesMs: 500,        // Invulnerability duration after taking damage
    carryingSpeedMult: 0.5 // Speed multiplier when carrying sample
  },

  // Auto-fire combat settings
  combat: {
    autoFireRange: 150,     // Max range for auto-targeting
    autoFireCooldownMs: 180, // Delay between auto-shots
    focusIndicatorScale: 1.3, // Scale of focus indicator ring
    damageFlashMs: 100       // Duration of damage flash effect
  },

  // Bullet settings
  bullet: {
    speed: 220,            // Bullet travel speed
    damage: 1,             // Damage per bullet
    ttlMs: 2000            // Time-to-live
  },

  // Base enemy settings (overridden by ENEMY_STATS per type)
  enemy: {
    baseSpeed: 30,
    baseHP: 2
  },

  // Mission/map settings
  mission: {
    defaultMapWidth: 600,
    defaultMapHeight: 800,
    spawnMargin: 50,        // Spawn distance from map edges
    objectiveInteractRange: 30, // Range to interact with objectives
    extractHoldTime: 5000,  // Time to hold in extract zone
    alertDecayRate: 0.0005, // Alert level decay per tick when idle
    maxAlertLevel: 1.0
  },

  // Camera settings for larger maps
  camera: {
    zoomBase: 0.8,          // Base zoom for mission maps
    zoomMin: 0.5,           // Min zoom (zoomed out)
    zoomMax: 1.2,           // Max zoom (zoomed in)
    followLerp: 0.15,       // Camera follow smoothness
    edgePadding: 100        // Padding when near map edges
  },

  // UI settings
  ui: {
    minimapSize: 120,       // Minimap dimensions
    minimapMargin: 10,
    objectiveMarkerSize: 8,
    priorityButtonSize: 40
  },

  // Legacy wave config (for backwards compat, not used in missions)
  wave: {
    enemiesBase: 5,
    enemiesPerWave: 2,
    speedScale: 0.1,
    hpScale: 1
  }
};
