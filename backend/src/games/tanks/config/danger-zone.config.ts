export interface DangerZoneConfig {
  targetDurationMs: number;
  maxDurationMs: number;
  warningStartsAtMs: number;
  damageStartsAtMs: number;
  shrinkEveryMs: number;
  initialRadius: number;
  finalRadius: number;
  suddenDeathRadius: number;
  finalHoldMs: number;
  suddenDeathShrinkMs: number;
  damagePerSecond: number;
}

export const DANGER_ZONE_EDGE_MARGIN_PX = 300;
export const DANGER_ZONE_INITIAL_RADIUS_MAP_PADDING_PX = 10;
export const DANGER_ZONE_WARNING_MESSAGE = 'hud.zone.closing';

export const DEVELOPMENT_DANGER_ZONE_OVERRIDE: Partial<DangerZoneConfig> = {
  warningStartsAtMs: 90_000,
  damageStartsAtMs: 120_000,
  targetDurationMs: 240_000,
  maxDurationMs: 360_000,
  shrinkEveryMs: 35_000,
  finalHoldMs: 40_000,
  suddenDeathShrinkMs: 30_000,
};

export const DANGER_ZONE_CONFIGS_BY_PLAYER_TIER: Record<4 | 8 | 16, DangerZoneConfig> = {
  4: {
    targetDurationMs: 240_000,
    maxDurationMs: 360_000,
    warningStartsAtMs: 90_000,
    damageStartsAtMs: 120_000,
    shrinkEveryMs: 35_000,
    initialRadius: 900,
    finalRadius: 220,
    suddenDeathRadius: 40,
    finalHoldMs: 40_000,
    suddenDeathShrinkMs: 30_000,
    damagePerSecond: 4,
  },
  8: {
    targetDurationMs: 300_000,
    maxDurationMs: 420_000,
    warningStartsAtMs: 100_000,
    damageStartsAtMs: 130_000,
    shrinkEveryMs: 35_000,
    initialRadius: 1000,
    finalRadius: 250,
    suddenDeathRadius: 50,
    finalHoldMs: 45_000,
    suddenDeathShrinkMs: 35_000,
    damagePerSecond: 5,
  },
  16: {
    targetDurationMs: 420_000,
    maxDurationMs: 540_000,
    warningStartsAtMs: 120_000,
    damageStartsAtMs: 150_000,
    shrinkEveryMs: 40_000,
    initialRadius: 1150,
    finalRadius: 300,
    suddenDeathRadius: 60,
    finalHoldMs: 50_000,
    suddenDeathShrinkMs: 45_000,
    damagePerSecond: 6,
  },
};
