// PortraitZoom.js
// Compute a tasteful portrait zoom (player ≈ TARGET px; ensure some width).

export function computePortraitZoom({
  viewW, viewH,
  playerFrameH = 24,
  TARGET_PLAYER_PX = 20,
  MIN_WORLD_WIDTH = 240,
  Z_MIN = 0.75,
  Z_MAX = 1.0
}) {
  const zPlayer = TARGET_PLAYER_PX / playerFrameH;
  const zHoriz  = viewW / MIN_WORLD_WIDTH;
  const zTarget = Math.min(zPlayer, zHoriz);
  return Math.max(Z_MIN, Math.min(Z_MAX, zTarget));
}

export function computeDesktopZoom({ viewW, viewH, baseW = 480, baseH = 270 }) {
  // Emulate Scale.FIT via camera zoom (no skew, no canvas scaling).
  return Math.min(viewW / baseW, viewH / baseH);
}

export function lerpZoom(cam, target, alpha = 0.15) {
  cam.setZoom(Phaser.Math.Linear(cam.zoom, target, Phaser.Math.Clamp(alpha, 0, 1)));
}
