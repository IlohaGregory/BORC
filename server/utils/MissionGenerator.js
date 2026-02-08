// MissionGenerator.js
// Server-side procedural mission generation based on difficulty

import { ObjectiveType, OBJECTIVE_CONFIG } from '../../shared/missions.js';

/**
 * Difficulty configuration - server authoritative
 */
export const DIFFICULTY_CONFIG = {
  1: { // Easy
    name: 'Easy',
    mapWidth: 500,
    mapHeight: 700,
    primaryObjectiveCount: { min: 1, max: 1 },
    optionalObjectiveCount: { min: 0, max: 1 },
    objectiveTypes: {
      primary: [ObjectiveType.DESTROY_NEST],
      optional: [ObjectiveType.DESTROY_NEST]
    },
    baseAlertLevel: 0.015,
    alertGrowth: 0.0008,
    extractionTimer: 90000, // 90 seconds
    maxEnemies: 15,
    spawnWeightMultiplier: 0.8
  },
  2: { // Medium
    name: 'Medium',
    mapWidth: 600,
    mapHeight: 800,
    primaryObjectiveCount: { min: 1, max: 2 },
    optionalObjectiveCount: { min: 0, max: 2 },
    objectiveTypes: {
      primary: [ObjectiveType.DESTROY_NEST, ObjectiveType.ACTIVATE_TERMINAL],
      optional: [ObjectiveType.DESTROY_NEST, ObjectiveType.ACTIVATE_TERMINAL]
    },
    baseAlertLevel: 0.025,
    alertGrowth: 0.0015,
    extractionTimer: 60000, // 60 seconds
    maxEnemies: 20,
    spawnWeightMultiplier: 1.0
  },
  3: { // Hard
    name: 'Hard',
    mapWidth: 700,
    mapHeight: 900,
    primaryObjectiveCount: { min: 2, max: 3 },
    optionalObjectiveCount: { min: 1, max: 2 },
    objectiveTypes: {
      primary: [ObjectiveType.DESTROY_NEST, ObjectiveType.ACTIVATE_TERMINAL, ObjectiveType.DESTROY_NEST],
      optional: [ObjectiveType.DESTROY_NEST, ObjectiveType.ACTIVATE_TERMINAL]
    },
    baseAlertLevel: 0.035,
    alertGrowth: 0.002,
    extractionTimer: 45000, // 45 seconds
    maxEnemies: 30,
    spawnWeightMultiplier: 1.2
  }
};

/**
 * Generate a procedural mission based on difficulty
 * @param {number} difficulty - 1 (Easy), 2 (Medium), 3 (Hard)
 * @returns {object} Mission configuration
 */
export function generate(difficulty) {
  const config = DIFFICULTY_CONFIG[difficulty];
  if (!config) {
    throw new Error(`Invalid difficulty: ${difficulty}. Must be 1, 2, or 3.`);
  }

  const missionId = `procedural_${difficulty}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

  const mapW = config.mapWidth;
  const mapH = config.mapHeight;

  // Drop zone: bottom center
  const dropZone = {
    x: Math.floor(mapW / 2),
    y: mapH - 50
  };

  // Extract zone: top center (opposite from drop)
  const extractZone = {
    x: Math.floor(mapW / 2),
    y: 50
  };

  // Generate primary objectives
  const primaryCount = randomInt(config.primaryObjectiveCount.min, config.primaryObjectiveCount.max);
  const primaryObjectives = [];
  const placedPositions = [dropZone, extractZone]; // Avoid placing objectives too close to these

  for (let i = 0; i < primaryCount; i++) {
    const type = randomChoice(config.objectiveTypes.primary);
    const pos = pickUnclusteredPos(mapW, mapH, placedPositions);
    primaryObjectives.push({ type, x: pos.x, y: pos.y });
    placedPositions.push(pos);
  }

  // Generate optional objectives
  const optionalCount = randomInt(config.optionalObjectiveCount.min, config.optionalObjectiveCount.max);
  const optionalObjectives = [];

  for (let i = 0; i < optionalCount; i++) {
    const type = randomChoice(config.objectiveTypes.optional);
    const pos = pickUnclusteredPos(mapW, mapH, placedPositions);
    optionalObjectives.push({ type, x: pos.x, y: pos.y });
    placedPositions.push(pos);
  }

  // Calculate extraction timer (base + bonus for more objectives)
  const totalObjectives = primaryCount + optionalCount;
  const extractionTimer = config.extractionTimer + (totalObjectives * 15000); // +15s per objective

  return {
    id: missionId,
    name: `${config.name} Operation`,
    description: `Procedurally generated ${config.name.toLowerCase()} difficulty mission`,
    difficulty: difficulty,
    procedural: true, // Flag to indicate this is procedurally generated
    mapWidth: mapW,
    mapHeight: mapH,
    primaryObjectives,
    optionalObjectives,
    extractZone,
    dropZone,
    baseAlertLevel: config.baseAlertLevel,
    alertGrowth: config.alertGrowth,
    extractionTimer,
    maxEnemies: config.maxEnemies,
    spawnWeightMultiplier: config.spawnWeightMultiplier
  };
}

/**
 * Pick a random position that doesn't cluster with existing positions
 * @param {number} mapW - Map width
 * @param {number} mapH - Map height
 * @param {Array} existing - Array of {x, y} positions to avoid
 * @param {number} minDist - Minimum distance from existing positions (default 150px)
 * @param {number} edgePadding - Padding from map edges (default 100px)
 * @returns {{x: number, y: number}} Position
 */
function pickUnclusteredPos(mapW, mapH, existing = [], minDist = 150, edgePadding = 100) {
  const maxAttempts = 20;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const x = randomInt(edgePadding, mapW - edgePadding);
    const y = randomInt(edgePadding, mapH - edgePadding);

    // Check distance from all existing positions
    let tooClose = false;
    for (const pos of existing) {
      const dist = Math.hypot(x - pos.x, y - pos.y);
      if (dist < minDist) {
        tooClose = true;
        break;
      }
    }

    if (!tooClose) {
      return { x, y };
    }
  }

  // Fallback: return center if all attempts failed
  console.warn('[MissionGenerator] Could not find unclustered position, using map center as fallback');
  return {
    x: Math.floor(mapW / 2),
    y: Math.floor(mapH / 2)
  };
}

/**
 * Random integer between min and max (inclusive)
 */
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Pick random element from array
 */
function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
