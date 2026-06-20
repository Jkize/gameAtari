import { ObstacleAssetId, ObstacleType, PowerUpType } from '../../types/game-state.types';
import { ACTIVE_BACKGROUND_SCENARIO } from '../../scenarios/background-scenarios';

export const C = {
  BG: ACTIVE_BACKGROUND_SCENARIO.base,
  GRID: ACTIVE_BACKGROUND_SCENARIO.minorLine,
  GRID_MAJOR: ACTIVE_BACKGROUND_SCENARIO.majorLine,
  BORDER: ACTIVE_BACKGROUND_SCENARIO.border,
  PANEL: 0x2b1d10,
  TEXT_WARM: 0xf2cf8f,
  TEXT_MUTED: 0x8c714a,

  BULLET: 0xffee00,
  BULLET_GLOW: 0xff9900,

  HP_HIGH: 0x00ff44,
  HP_MED: 0xffcc00,
  HP_LOW: 0xff2244,
} as const;

export const OBS: Record<string, { fill: number; glow: number }> = {
  bush: { fill: 0x16451f, glow: 0x33cc33 },
  decoration: { fill: 0x2f7d32, glow: 0x77aa33 },
  wood: { fill: 0x4a2508, glow: 0xcc6622 },
  rock: { fill: 0x30303a, glow: 0x8888aa },
  steel: { fill: 0x1a2438, glow: 0x3366ff },
  mirror: { fill: 0x004455, glow: 0x00ddff },
};

export const OBSTACLE_ASSET_BY_TYPE: Record<ObstacleType, ObstacleAssetId> = {
  bush: 'bush_01_rounded_dense',
  decoration: 'decoration_01_spiky_organic',
  wood: 'wood_barricade',
  rock: 'rock_block',
  steel: 'steel_block_01',
  mirror: 'mirror_panel_01',
};

export const BUSH_COVER_DEPTH = 8.5;
export const POWER_UP_COLOR: Record<PowerUpType, number> = {
  triple_shot: 0x10ff85,
  shotgun: 0x10ff85,
  grenade: 0xffb000,
  laser: 0xff31ed,
};
export const POWER_UP_ICON_SCALE = 3.4;
export const POWER_UP_GLOW_SCALE = 1.75;
export const POWER_UP_RING_SCALE = 1.35;
export const HIT_REVEAL_MS = 1000;
export const HIT_REVEAL_BLINK_MS = 125;
export const REVEALED_TANK_DEPTH = BUSH_COVER_DEPTH + 1;
export const MONO = 'Share Tech Mono, Courier New, monospace';
export const BODY_TURN_STEP = 0.1;
export const PLAYER_LABEL_OFFSET = 1.5;
export const TANK_TURRET_SCALE = 3;

export function colorToCss(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}

export function hashString(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (Math.imul(31, h) + value.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}
