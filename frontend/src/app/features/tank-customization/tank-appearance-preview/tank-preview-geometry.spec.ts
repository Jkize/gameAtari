import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TURRET_ROTATION_DEG,
  nearestEquivalentAngle,
  turretRotationForPoint,
} from './tank-preview-geometry';

describe('tank preview geometry', () => {
  it('maps pointer positions to the pistol template rotation', () => {
    expect(turretRotationForPoint(10, 0, 0, 0)).toBe(-90);
    expect(turretRotationForPoint(0, 10, 0, 0)).toBe(0);
    expect(turretRotationForPoint(-10, 0, 0, 0)).toBe(90);
    expect(turretRotationForPoint(0, -10, 0, 0)).toBe(-180);
  });

  it('keeps equivalent angles on the shortest continuous path', () => {
    expect(nearestEquivalentAngle(-180, DEFAULT_TURRET_ROTATION_DEG)).toBe(180);
    expect(nearestEquivalentAngle(-175, 180)).toBe(185);
    expect(nearestEquivalentAngle(175, -180)).toBe(-185);
  });
});
