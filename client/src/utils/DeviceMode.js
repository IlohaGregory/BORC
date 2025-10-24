// WHAT: Decide "desktop-like" vs "mobile portrait-like" behavior.
// WHY: Keep one Phaser app, but switch camera policy & UI cleanly.

export function isTouchCapable() {
  return (
    'ontouchstart' in window ||
    (navigator.maxTouchPoints ?? 0) > 0 ||
    (window.matchMedia?.('(pointer: coarse)').matches ?? false)
  );
}

export function isDesktopLike(viewW, viewH) {
  // Touch-capable devices are treated as mobile by default.
  // Also treat very large screens as desktop even if touch exists (2-in-1s).
  const minSide = Math.min(viewW, viewH);
  const largeScreen = minSide >= 700; // tweak if you like
  return !isTouchCapable() || largeScreen;
}
