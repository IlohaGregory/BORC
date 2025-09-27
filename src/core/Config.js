// Game entities config file
export const CFG = {
  player: {
    speed: 80,             // Movement speed in pixels/sec
    fireCooldownMs: 150,   // Minimum delay between shots
    hp: 20,                 // Hit points / lives
    iFramesMs: 500         // Invulnerability duration after taking damage
  },
  bullet: {
    speed: 220,            // Bullet travel speed
    damage: 1,             // Damage per bullet
    ttlMs: 2000             // Time-to-live (auto-destroy) to avoid memory leaks
  },
  enemy:  {
    baseSpeed: 30,         // Starting speed; increases with wave
    baseHP: 2              // Starting HP; also scales with wave
  }
};

