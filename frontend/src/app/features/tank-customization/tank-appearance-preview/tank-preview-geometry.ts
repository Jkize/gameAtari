export const DEFAULT_TURRET_ROTATION_DEG = 180;
export const TURRET_ORIGIN_X_RATIO = 256 / 512;
export const TURRET_ORIGIN_Y_RATIO = 150 / 512;

export function turretRotationForPoint(
  pointerX: number,
  pointerY: number,
  centerX: number,
  centerY: number,
): number {
  const deltaX = pointerX - centerX;
  const deltaY = pointerY - centerY;
  if (deltaX === 0 && deltaY === 0) return DEFAULT_TURRET_ROTATION_DEG;

  // The source pistol points down. Subtracting 90° maps it to the pointer vector.
  return (Math.atan2(deltaY, deltaX) * 180) / Math.PI - 90;
}

export function nearestEquivalentAngle(target: number, current: number): number {
  return target + Math.round((current - target) / 360) * 360;
}
