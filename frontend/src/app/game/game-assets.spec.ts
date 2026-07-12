import { describe, expect, it } from 'vitest';
import {
  GAME_PUBLIC_ASSET_PATHS,
  PHASER_GAME_ASSETS,
  SHIELD_TEMPLATE_PATH,
  TANK_TEMPLATE_PATHS,
  WEAPON_OVERLAY_TEMPLATE_PATHS,
} from './game-assets';

describe('game asset manifest', () => {
  it('uses unique Phaser cache keys and public paths', () => {
    const keys = PHASER_GAME_ASSETS.map((asset) => asset.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(GAME_PUBLIC_ASSET_PATHS).size).toBe(GAME_PUBLIC_ASSET_PATHS.length);
  });

  it('includes runtime-generated texture templates in the preload list', () => {
    const paths = new Set(GAME_PUBLIC_ASSET_PATHS);
    Object.values(TANK_TEMPLATE_PATHS).forEach((path) => expect(paths.has(path)).toBe(true));
    Object.values(WEAPON_OVERLAY_TEMPLATE_PATHS).forEach((path) =>
      expect(paths.has(path)).toBe(true),
    );
    expect(paths.has(SHIELD_TEMPLATE_PATH)).toBe(true);
  });
});
