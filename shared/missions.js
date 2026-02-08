// shared/missions.js
// Mission definitions shared between client and server

export const ObjectiveType = {
  DESTROY_NEST: 'destroy_nest',
  ACTIVATE_TERMINAL: 'activate_terminal',
  RETRIEVE_SAMPLE: 'retrieve_sample',
  ELIMINATE_TARGET: 'eliminate_target',
  DEFEND_BEACON: 'defend_beacon',
  PLANT_CHARGES: 'plant_charges',
  EXTRACT: 'extract'
};

export const ObjectiveStatus = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

export const MissionStatus = {
  BRIEFING: 'briefing',
  DROP_IN: 'drop_in',
  ACTIVE: 'active',
  EXTRACTION: 'extraction',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

// Enemy type definitions
export const EnemyType = {
  SWARMER: 'swarmer',
  SPITTER: 'spitter',
  CHARGER: 'charger',
  BROOD_MOTHER: 'brood_mother',
  BURROWER: 'burrower'
};

export const ENEMY_STATS = {
  [EnemyType.SWARMER]: {
    hp: 1,
    speed: 45,
    damage: 1,
    threat: 1,
    score: 1,
    size: 0.5
  },
  [EnemyType.SPITTER]: {
    hp: 3,
    speed: 25,
    damage: 2,
    threat: 3,
    score: 3,
    range: 150,
    projectileSpeed: 120,
    size: 0.7
  },
  [EnemyType.CHARGER]: {
    hp: 8,
    speed: 35,
    chargeSpeed: 150,
    damage: 4,
    threat: 5,
    score: 5,
    chargeDistance: 80,
    size: 1.0
  },
  [EnemyType.BROOD_MOTHER]: {
    hp: 20,
    speed: 15,
    damage: 2,
    threat: 6,
    score: 10,
    spawnRate: 3000, // ms between spawning swarmers
    spawnCount: 3,
    size: 1.5
  },
  [EnemyType.BURROWER]: {
    hp: 5,
    speed: 40,
    damage: 3,
    threat: 4,
    score: 4,
    burrowTime: 2000,
    size: 0.8
  }
};

// Objective type configurations
export const OBJECTIVE_CONFIG = {
  [ObjectiveType.DESTROY_NEST]: {
    name: 'Destroy Bug Nest',
    description: 'Destroy the enemy nest',
    hp: 15,
    radius: 20,
    defendersOnDamage: 3,
    completionReward: 50
  },
  [ObjectiveType.ACTIVATE_TERMINAL]: {
    name: 'Activate Terminal',
    description: 'Hold position to activate',
    holdTime: 8000, // ms
    radius: 30,
    waveInterval: 3000,
    waveSize: 5,
    completionReward: 40
  },
  [ObjectiveType.RETRIEVE_SAMPLE]: {
    name: 'Retrieve Sample',
    description: 'Collect and extract the sample',
    slowFactor: 0.5, // movement speed multiplier when carrying
    completionReward: 60
  },
  [ObjectiveType.ELIMINATE_TARGET]: {
    name: 'Eliminate Target',
    description: 'Hunt down the elite bug',
    targetType: EnemyType.CHARGER,
    targetHpMultiplier: 3,
    fleeThreshold: 0.3, // flees at 30% HP
    completionReward: 70
  },
  [ObjectiveType.DEFEND_BEACON]: {
    name: 'Defend Beacon',
    description: 'Protect the beacon from destruction',
    beaconHp: 100,
    defendTime: 30000,
    waveInterval: 5000,
    waveSize: 8,
    completionReward: 80
  },
  [ObjectiveType.PLANT_CHARGES]: {
    name: 'Plant Explosives',
    description: 'Plant charges at marked locations',
    chargeCount: 3,
    plantTime: 3000, // ms to plant each
    detonationDelay: 5000,
    completionReward: 55
  },
  [ObjectiveType.EXTRACT]: {
    name: 'Extract',
    description: 'Reach the extraction zone',
    radius: 40,
    holdTime: 5000,
    completionReward: 100
  }
};

// Mission definitions
export const MISSIONS = {
  bug_hunt_1: {
    id: 'bug_hunt_1',
    name: 'Bug Hunt',
    description: 'Clear the infestation and extract',
    difficulty: 1,
    mapWidth: 600,
    mapHeight: 800,
    primaryObjectives: [
      { type: ObjectiveType.DESTROY_NEST, x: 300, y: 200 }
    ],
    optionalObjectives: [],
    extractZone: { x: 300, y: 700 },
    dropZone: { x: 300, y: 650 },
    baseAlertLevel: 0.02,
    alertGrowth: 0.001,
    extractionTimer: 60000
  },

  exterminate_1: {
    id: 'exterminate_1',
    name: 'Extermination',
    description: 'Destroy multiple nests before extraction',
    difficulty: 2,
    mapWidth: 700,
    mapHeight: 900,
    primaryObjectives: [
      { type: ObjectiveType.DESTROY_NEST, x: 200, y: 250 },
      { type: ObjectiveType.DESTROY_NEST, x: 500, y: 350 }
    ],
    optionalObjectives: [
      { type: ObjectiveType.RETRIEVE_SAMPLE, x: 350, y: 150 }
    ],
    extractZone: { x: 350, y: 800 },
    dropZone: { x: 350, y: 750 },
    baseAlertLevel: 0.025,
    alertGrowth: 0.0015,
    extractionTimer: 90000
  },

  terminal_defense: {
    id: 'terminal_defense',
    name: 'Data Recovery',
    description: 'Activate the terminal and defend it',
    difficulty: 2,
    mapWidth: 600,
    mapHeight: 800,
    primaryObjectives: [
      { type: ObjectiveType.ACTIVATE_TERMINAL, x: 300, y: 400 }
    ],
    optionalObjectives: [
      { type: ObjectiveType.DESTROY_NEST, x: 150, y: 200 }
    ],
    extractZone: { x: 300, y: 700 },
    dropZone: { x: 300, y: 650 },
    baseAlertLevel: 0.03,
    alertGrowth: 0.002,
    extractionTimer: 60000
  },

  hunt_the_beast: {
    id: 'hunt_the_beast',
    name: 'Hunt the Beast',
    description: 'Track and eliminate the Brood Mother',
    difficulty: 3,
    mapWidth: 800,
    mapHeight: 1000,
    primaryObjectives: [
      {
        type: ObjectiveType.ELIMINATE_TARGET,
        x: 400, y: 300,
        targetType: EnemyType.BROOD_MOTHER,
        targetHpMultiplier: 2
      }
    ],
    optionalObjectives: [
      { type: ObjectiveType.DESTROY_NEST, x: 200, y: 500 },
      { type: ObjectiveType.DESTROY_NEST, x: 600, y: 500 }
    ],
    extractZone: { x: 400, y: 900 },
    dropZone: { x: 400, y: 850 },
    baseAlertLevel: 0.035,
    alertGrowth: 0.002,
    extractionTimer: 120000
  },

  demolition: {
    id: 'demolition',
    name: 'Demolition',
    description: 'Plant explosives and escape',
    difficulty: 3,
    mapWidth: 700,
    mapHeight: 900,
    primaryObjectives: [
      { type: ObjectiveType.PLANT_CHARGES, charges: [
        { x: 200, y: 250 },
        { x: 500, y: 250 },
        { x: 350, y: 400 }
      ]}
    ],
    optionalObjectives: [],
    extractZone: { x: 350, y: 800 },
    dropZone: { x: 350, y: 750 },
    baseAlertLevel: 0.04,
    alertGrowth: 0.0025,
    extractionTimer: 45000 // Shorter timer after explosives armed
  }
};

// Get mission list for UI
export function getMissionList() {
  return Object.values(MISSIONS).map(m => ({
    id: m.id,
    name: m.name,
    description: m.description,
    difficulty: m.difficulty,
    objectiveCount: m.primaryObjectives.length + m.optionalObjectives.length
  }));
}

// Get full mission config by ID
export function getMission(id) {
  return MISSIONS[id] || null;
}

// Calculate score multiplier for difficulty
export function getDifficultyMultiplier(difficulty) {
  return 1 + (difficulty - 1) * 0.5;
}

// Spawn enemy based on alert level and mission difficulty
export function getSpawnWeights(alertLevel, difficulty) {
  // Higher alert = more dangerous enemies
  const base = {
    [EnemyType.SWARMER]: 100,
    [EnemyType.SPITTER]: 0,
    [EnemyType.CHARGER]: 0,
    [EnemyType.BROOD_MOTHER]: 0,
    [EnemyType.BURROWER]: 0
  };

  if (alertLevel > 0.2) {
    base[EnemyType.SPITTER] = 20 * difficulty;
    base[EnemyType.BURROWER] = 10 * difficulty;
  }
  if (alertLevel > 0.4) {
    base[EnemyType.CHARGER] = 15 * difficulty;
    base[EnemyType.SPITTER] = 30 * difficulty;
  }
  if (alertLevel > 0.6) {
    base[EnemyType.BROOD_MOTHER] = 5 * difficulty;
    base[EnemyType.CHARGER] = 25 * difficulty;
  }
  if (alertLevel > 0.8) {
    base[EnemyType.BROOD_MOTHER] = 10 * difficulty;
  }

  return base;
}

// Pick random enemy type based on weights
export function pickEnemyType(weights) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  if (total === 0) return EnemyType.SWARMER;

  let roll = Math.random() * total;
  for (const [type, weight] of Object.entries(weights)) {
    roll -= weight;
    if (roll <= 0) return type;
  }
  return EnemyType.SWARMER;
}

/**
 * Difficulty configuration for procedural mission generation.
 * Three tiers: Easy (1), Medium (2), Hard (3)
 * Used by both server (MissionGenerator.js) and client (DifficultySelectScene.js)
 */
export const DIFFICULTY_CONFIG = {
  1: {
    name: 'Easy',
    description: 'A straightforward operation. Good for beginners.',
    estimatedTime: '3-5 min',
    mapWidth: 600,
    mapHeight: 800,
    objectiveCounts: { primary: 1, optional: 0 },
    objectiveTypes: [
      ObjectiveType.DESTROY_NEST,
      ObjectiveType.RETRIEVE_SAMPLE
    ],
    extractionTimer: 90000,
    baseAlertLevel: 0.02,
    alertGrowth: 0.001,
    maxEnemies: 15,
    spawnMultiplier: 0.8
  },
  2: {
    name: 'Medium',
    description: 'A challenging mission with multiple objectives.',
    estimatedTime: '5-8 min',
    mapWidth: 600,
    mapHeight: 800,
    objectiveCounts: { primary: { min: 1, max: 2 }, optional: { min: 0, max: 1 } },
    objectiveTypes: [
      ObjectiveType.DESTROY_NEST,
      ObjectiveType.ACTIVATE_TERMINAL,
      ObjectiveType.RETRIEVE_SAMPLE
    ],
    extractionTimer: 75000,
    baseAlertLevel: 0.03,
    alertGrowth: 0.0015,
    maxEnemies: 20,
    spawnMultiplier: 1.0
  },
  3: {
    name: 'Hard',
    description: 'High-intensity combat. Extraction will be difficult.',
    estimatedTime: '8-12 min',
    mapWidth: 700,
    mapHeight: 900,
    objectiveCounts: { primary: { min: 2, max: 3 }, optional: { min: 1, max: 2 } },
    objectiveTypes: [
      ObjectiveType.DESTROY_NEST,
      ObjectiveType.ACTIVATE_TERMINAL,
      ObjectiveType.RETRIEVE_SAMPLE,
      ObjectiveType.DEFEND_BEACON,
      ObjectiveType.ELIMINATE_TARGET
    ],
    extractionTimer: 60000,
    baseAlertLevel: 0.04,
    alertGrowth: 0.002,
    maxEnemies: 30,
    spawnMultiplier: 1.3
  }
};

/**
 * Pick a random position that is at least minDist away from all existing positions.
 * Shared helper for procedural generation.
 */
export function pickUnclusteredPos(mapW, mapH, existing, minDist = 150, edgeMargin = 100) {
  const maxAttempts = 50;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const x = edgeMargin + Math.random() * (mapW - 2 * edgeMargin);
    const y = edgeMargin + Math.random() * (mapH - 2 * edgeMargin);

    let valid = true;
    for (const pos of existing) {
      const dist = Math.hypot(x - pos.x, y - pos.y);
      if (dist < minDist) {
        valid = false;
        break;
      }
    }

    if (valid) {
      return { x: Math.round(x), y: Math.round(y) };
    }
  }

  // Fallback: grid-based approach
  const cols = Math.floor((mapW - 2 * edgeMargin) / minDist);
  const rows = Math.floor((mapH - 2 * edgeMargin) / minDist);
  const col = Math.floor(Math.random() * Math.max(1, cols));
  const row = Math.floor(Math.random() * Math.max(1, rows));

  return {
    x: Math.round(edgeMargin + col * minDist + minDist / 2),
    y: Math.round(edgeMargin + row * minDist + minDist / 2)
  };
}

/**
 * Generate a procedural mission configuration based on difficulty tier.
 * Can be used on both client (LocalGameLoop) and server (GameRoom).
 */
export function generateProceduralMission(difficulty) {
  const config = DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG[1];
  const missionId = `proc_d${difficulty}_${Date.now().toString(36)}`;

  const mapWidth = config.mapWidth;
  const mapHeight = config.mapHeight;

  // Drop zone at bottom center, extract zone at top center
  const dropZone = {
    x: Math.round(mapWidth / 2),
    y: mapHeight - 100
  };

  const extractZone = {
    x: Math.round(mapWidth / 2),
    y: 100
  };

  const reservedPositions = [dropZone, extractZone];

  // Helper for count ranges
  const getCount = (countSpec) => {
    if (typeof countSpec === 'number') return countSpec;
    return Math.floor(Math.random() * (countSpec.max - countSpec.min + 1)) + countSpec.min;
  };

  // Generate primary objectives
  const primaryCount = getCount(config.objectiveCounts.primary);
  const primaryObjectives = [];

  for (let i = 0; i < primaryCount; i++) {
    const type = config.objectiveTypes[Math.floor(Math.random() * config.objectiveTypes.length)];
    const pos = pickUnclusteredPos(
      mapWidth,
      mapHeight,
      [...reservedPositions, ...primaryObjectives.map(o => ({ x: o.x, y: o.y }))]
    );

    const objective = { type, x: pos.x, y: pos.y };

    if (type === ObjectiveType.DESTROY_NEST) {
      objective.hp = OBJECTIVE_CONFIG[type].hp;
    } else if (type === ObjectiveType.ELIMINATE_TARGET) {
      objective.targetType = 'charger';
      objective.targetHpMultiplier = 2 + (difficulty - 1);
    }

    primaryObjectives.push(objective);
  }

  // Generate optional objectives
  const optionalCount = getCount(config.objectiveCounts.optional);
  const optionalObjectives = [];
  const optionalTypes = [ObjectiveType.DESTROY_NEST, ObjectiveType.RETRIEVE_SAMPLE];

  for (let i = 0; i < optionalCount; i++) {
    const type = optionalTypes[Math.floor(Math.random() * optionalTypes.length)];
    const pos = pickUnclusteredPos(
      mapWidth,
      mapHeight,
      [
        ...reservedPositions,
        ...primaryObjectives.map(o => ({ x: o.x, y: o.y })),
        ...optionalObjectives.map(o => ({ x: o.x, y: o.y }))
      ]
    );

    const objective = { type, x: pos.x, y: pos.y };
    if (type === ObjectiveType.DESTROY_NEST) {
      objective.hp = OBJECTIVE_CONFIG[type].hp;
    }
    optionalObjectives.push(objective);
  }

  // Generate mission name
  const missionNames = {
    1: ['Bug Hunt', 'Recon', 'Sweep', 'Patrol'],
    2: ['Assault', 'Breach', 'Strike', 'Raid'],
    3: ['Extermination', 'Decimation', 'Annihilation', 'Purge']
  };
  const namePool = missionNames[difficulty] || missionNames[1];
  const name = namePool[Math.floor(Math.random() * namePool.length)];

  return {
    id: missionId,
    name: `${name} ${String.fromCharCode(65 + Math.floor(Math.random() * 26))}-${Math.floor(Math.random() * 99) + 1}`,
    description: config.description,
    difficulty,
    mapWidth,
    mapHeight,
    primaryObjectives,
    optionalObjectives,
    extractZone,
    dropZone,
    baseAlertLevel: config.baseAlertLevel,
    alertGrowth: config.alertGrowth,
    extractionTimer: config.extractionTimer,
    maxEnemies: config.maxEnemies,
    spawnMultiplier: config.spawnMultiplier,
    procedural: true
  };
}
