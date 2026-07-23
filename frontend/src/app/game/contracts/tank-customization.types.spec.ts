import {
  DEFAULT_TANK_CUSTOMIZATION,
  normalizeTankCustomization,
  tankColorHexToNumber,
} from './tank-customization.types';

describe('tank customization contract', () => {
  it('normalizes a valid versioned payload', () => {
    expect(
      normalizeTankCustomization({
        version: 1,
        skinId: 'classic',
        colors: { body: '#ABCDEF', turret: '#123456', tracks: '#FEDCBA' },
      }),
    ).toEqual({
      version: 1,
      skinId: 'classic',
      colors: { body: '#abcdef', turret: '#123456', tracks: '#fedcba' },
    });
  });

  it('falls back when a payload has an unsupported skin or invalid color', () => {
    expect(
      normalizeTankCustomization({
        version: 1,
        skinId: 'future-skin',
        colors: { body: '#fff', turret: '#123456', tracks: '#fedcba' },
      }),
    ).toEqual(DEFAULT_TANK_CUSTOMIZATION);
  });

  it('converts contract colors to Phaser-compatible numbers', () => {
    expect(tankColorHexToNumber('#24c7d9')).toBe(0x24c7d9);
  });
});
