// shared/targeting.js
// Target priority system used by both client and server

export const TargetPriority = {
  CLOSEST: 'closest',
  LOWEST_HP: 'lowest_hp',
  HIGHEST_THREAT: 'highest_threat',
  CURRENT_AGGRESSOR: 'current_aggressor'
};

export const PRIORITY_ORDER = [
  TargetPriority.CLOSEST,
  TargetPriority.LOWEST_HP,
  TargetPriority.HIGHEST_THREAT,
  TargetPriority.CURRENT_AGGRESSOR
];

// Enemy threat levels - higher = more dangerous
export const THREAT_LEVELS = {
  swarmer: 1,
  spitter: 3,
  burrower: 4,
  charger: 5,
  brood_mother: 6
};

/**
 * Select target based on priority rule
 * @param {Object} player - { x, y, lastAttackedBy }
 * @param {Array} enemies - [{ id, x, y, hp, type, alive }]
 * @param {string} priority - TargetPriority value
 * @param {number} range - Max targeting range
 * @returns {Object|null} - Target enemy or null
 */
export function selectTarget(player, enemies, priority, range) {
  const alive = enemies.filter(e => e.alive !== false);
  if (alive.length === 0) return null;

  // Filter by range
  const inRange = alive.filter(e => {
    const dist = Math.hypot(e.x - player.x, e.y - player.y);
    return dist <= range;
  });

  if (inRange.length === 0) return null;

  switch (priority) {
    case TargetPriority.CLOSEST:
      return inRange.reduce((best, e) => {
        const dist = Math.hypot(e.x - player.x, e.y - player.y);
        const bestDist = best ? Math.hypot(best.x - player.x, best.y - player.y) : Infinity;
        return dist < bestDist ? e : best;
      }, null);

    case TargetPriority.LOWEST_HP:
      return inRange.reduce((best, e) => {
        if (!best) return e;
        return e.hp < best.hp ? e : best;
      }, null);

    case TargetPriority.HIGHEST_THREAT:
      return inRange.reduce((best, e) => {
        const threat = THREAT_LEVELS[e.type] || 1;
        const bestThreat = best ? (THREAT_LEVELS[best.type] || 1) : 0;
        return threat > bestThreat ? e : best;
      }, null);

    case TargetPriority.CURRENT_AGGRESSOR:
      // Target whoever last hit the player
      if (player.lastAttackedBy) {
        const aggressor = inRange.find(e => e.id === player.lastAttackedBy);
        if (aggressor) return aggressor;
      }
      // Fall back to closest if no attacker
      return selectTarget(player, enemies, TargetPriority.CLOSEST, range);

    default:
      return selectTarget(player, enemies, TargetPriority.CLOSEST, range);
  }
}

/**
 * Find enemy by ID for focus-fire
 * @param {Array} enemies
 * @param {string} targetId
 * @returns {Object|null}
 */
export function findFocusTarget(enemies, targetId) {
  if (!targetId) return null;
  return enemies.find(e => e.id === targetId && e.alive !== false) || null;
}
