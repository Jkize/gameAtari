import {
  DEFAULT_TANK_CUSTOMIZATION,
  normalizeTankCustomization,
  resolveTankRenderColors,
  tankColorHexToNumber,
} from './tank-customization.types';

describe('tank customization contract', () => {
  it('normalizes a valid versioned payload', () => {
    expect(
      normalizeTankCustomization({
        version: 1,
        baseColor: '#ABCDEF',
        paint: {
          hull: { base: '#ABCDEF' },
          turret: { base: '#123456' },
          tracks: { treadShadow: '#FEDCBA' },
        },
      }),
    ).toEqual({
      version: 1,
      baseColor: '#abcdef',
      paint: {
        hull: { base: '#abcdef' },
        turret: { base: '#123456' },
        tracks: { treadShadow: '#fedcba' },
      },
    });
  });

  it('falls back when a payload has an invalid base color', () => {
    expect(
      normalizeTankCustomization({
        version: 1,
        baseColor: '#fff',
        paint: { hull: '#fff', turret: '#123456', trackTread: '#fedcba' },
      }),
    ).toEqual(DEFAULT_TANK_CUSTOMIZATION);
  });

  it('converts contract colors to Phaser-compatible numbers', () => {
    expect(tankColorHexToNumber('#24c7d9')).toBe(0x24c7d9);
  });

  it('assigns hull to tank effects and turret to weapon rendering', () => {
    expect(resolveTankRenderColors({
      version: 1,
      baseColor: '#db3a2c',
      paint: {
        hull: { base: '#24c7d9' },
        turret: { base: '#3478f6' },
        tracks: { treadShadow: '#222222' },
      },
    }, 0xffffff)).toEqual({
      hull: 0x24c7d9,
      turret: 0x3478f6,
      trackTreadShadow: 0x222222,
    });
  });
});
