import {
  TANK_COLOR_PRESETS,
  mergeTankPaint,
  resolveTankCustomization,
  stableLegacyBaseColor,
} from './tank-customization.types';

describe('tank customization domain', () => {
  it('resolves missing paint slots from the base color', () => {
    expect(resolveTankCustomization({
      version: 1,
      baseColor: '#F3D33B',
      paint: { turret: '#3478F6' },
    }, '#db3a2c')).toEqual({
      version: 1,
      baseColor: '#f3d33b',
      paint: {
        hull: { base: '#f3d33b' },
        turret: { base: '#3478f6' },
        tracks: { treadShadow: '#f3d33b' },
      },
    });
  });

  it('stores only overrides that differ from the base color', () => {
    const stored = mergeTankPaint(
      {
        version: 1,
        skinId: 'classic',
        baseColor: '#db3a2c',
        paint: { hull: '#3478f6' },
      },
      { hull: { base: '#DB3A2C' }, tracks: { treadShadow: '#24C7D9' } },
      '#db3a2c',
    );
    expect(stored.paint).toEqual({ tracks: { treadShadow: '#24c7d9' } });
    expect(stored).not.toHaveProperty('skinId');
  });

  it('assigns legacy users a stable color from the supported palette', () => {
    const first = stableLegacyBaseColor('user-123');
    expect(stableLegacyBaseColor('user-123')).toBe(first);
    expect(TANK_COLOR_PRESETS).toContain(first);
  });
});
