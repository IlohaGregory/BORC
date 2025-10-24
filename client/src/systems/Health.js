/**
 * Health component for Arcade sprites (and anything with setData/getData).
 */
export const Health = {
  // Attach health data and a few helpers onto the sprite
  attach(sprite, { max = 1, onDeath = null } = {}) {
    sprite.setDataEnabled();               // enables sprite.data
    sprite.setData('hp', max);
    sprite.setData('hpMax', max);
    sprite.setData('onDeath', onDeath);
    sprite.setData('alive', true);
    // optional flash flag for i-frames
    sprite.setData('invUntil', 0);
  },

  get(sprite) { return sprite.getData('hp') ?? 0; },
  max(sprite) { return sprite.getData('hpMax') ?? 0; },
  isDead(sprite) { return !sprite.getData('alive'); },

  heal(sprite, amount = 1) {
    const hp = Math.min(this.max(sprite), this.get(sprite) + amount);
    sprite.setData('hp', hp);
    return hp;
  },

  /**
   * Applies damage; returns new HP.
   * Supports simple i-frames via `invUntil` timestamp (ms since scene.time.now).
   */
  damage(sprite, amount = 1, scene = null, opts = {}) {
    const now = scene?.time?.now ?? performance.now();
    const invUntil = sprite.getData('invUntil') || 0;
    if (now < invUntil) return this.get(sprite); // still invulnerable

    const hp = Math.max(0, this.get(sprite) - amount);
    sprite.setData('hp', hp);

    // brief i-frames if requested
    const iFramesMs = opts.iFramesMs ?? 0;
    if (iFramesMs > 0) sprite.setData('invUntil', now + iFramesMs);

    if (hp <= 0 && sprite.getData('alive')) {
      sprite.setData('alive', false);
      const onDeath = sprite.getData('onDeath');
      try { onDeath && onDeath(); } catch {}
    }
    return hp;
  }
};
