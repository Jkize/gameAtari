import { Injectable } from '@nestjs/common';
import { GameMap } from './types/map.types';

export type DangerZonePhase = 'inactive' | 'warning' | 'active' | 'final' | 'sudden_death';

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

export interface DangerZoneRuntimeState extends DangerZoneConfig {
  enabled: boolean;
  edgeMarginPx: number;
  centerX: number;
  centerY: number;
  startedAtMs: number;
  warningMessage: string;
  damageCarryByPlayerId: Record<string, number>;
}

export interface DangerZonePublicState {
  phase: DangerZonePhase;
  centerX: number;
  centerY: number;
  radius: number;
  warningStartsAt: number;
  damageStartsAt: number;
}

const EDGE_MARGIN_PX = 300;
const INITIAL_RADIUS_MAP_PADDING_PX = 10;
const WARNING_MESSAGE = 'hud.zone.closing';

const CONFIGS_BY_PLAYER_TIER: Record<4 | 8 | 16, DangerZoneConfig> = {
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

@Injectable()
export class DangerZoneService {
  createRuntimeState(
    map: GameMap,
    playerCount: number,
    startedAtMs: number,
    configOverride: Partial<DangerZoneConfig> = {},
  ): DangerZoneRuntimeState {
    const config = {
      ...this.configForPlayerCount(playerCount),
      ...configOverride,
    };
    const center = this.pickCenter(map, EDGE_MARGIN_PX);
    const initialRadius = Math.max(
      config.initialRadius,
      this.radiusCoveringMap(map, center.x, center.y) + INITIAL_RADIUS_MAP_PADDING_PX,
    );

    return {
      enabled: true,
      edgeMarginPx: EDGE_MARGIN_PX,
      warningMessage: WARNING_MESSAGE,
      startedAtMs,
      centerX: center.x,
      centerY: center.y,
      damageCarryByPlayerId: {},
      ...config,
      initialRadius,
    };
  }

  configForPlayerCount(playerCount: number): DangerZoneConfig {
    if (playerCount <= 4) return CONFIGS_BY_PLAYER_TIER[4];
    if (playerCount <= 8) return CONFIGS_BY_PLAYER_TIER[8];
    return CONFIGS_BY_PLAYER_TIER[16];
  }

  pickCenter(map: Pick<GameMap, 'width' | 'height'>, edgeMarginPx = EDGE_MARGIN_PX): { x: number; y: number } {
    return {
      x: this.pickAxisCenter(map.width, edgeMarginPx),
      y: this.pickAxisCenter(map.height, edgeMarginPx),
    };
  }

  buildPublicState(zone: DangerZoneRuntimeState, now: number): DangerZonePublicState {
    const phase = this.phaseAt(zone, now);
    const radius = this.radiusAt(zone, now);

    return {
      phase,
      centerX: zone.centerX,
      centerY: zone.centerY,
      radius,
      warningStartsAt: zone.startedAtMs + zone.warningStartsAtMs,
      damageStartsAt: zone.startedAtMs + zone.damageStartsAtMs,
    };
  }

  phaseAt(zone: DangerZoneRuntimeState, now: number): DangerZonePhase {
    const elapsedMs = Math.max(0, now - zone.startedAtMs);
    if (elapsedMs < zone.warningStartsAtMs) return 'inactive';
    if (elapsedMs < zone.damageStartsAtMs) return 'warning';
    if (elapsedMs >= zone.targetDurationMs + zone.finalHoldMs) return 'sudden_death';
    if (elapsedMs >= zone.targetDurationMs) return 'final';
    return 'active';
  }

  radiusAt(zone: DangerZoneRuntimeState, now: number): number {
    const elapsedMs = Math.max(0, now - zone.startedAtMs);
    if (elapsedMs < zone.damageStartsAtMs) return zone.initialRadius;
    if (elapsedMs >= zone.targetDurationMs + zone.finalHoldMs) {
      const suddenElapsedMs = elapsedMs - zone.targetDurationMs - zone.finalHoldMs;
      const progress = Math.min(1, suddenElapsedMs / Math.max(1, zone.suddenDeathShrinkMs));
      return zone.finalRadius + (zone.suddenDeathRadius - zone.finalRadius) * progress;
    }
    if (elapsedMs >= zone.targetDurationMs) return zone.finalRadius;

    const shrinkDurationMs = Math.max(1, zone.targetDurationMs - zone.damageStartsAtMs);
    const progress = Math.min(1, (elapsedMs - zone.damageStartsAtMs) / shrinkDurationMs);
    return zone.initialRadius + (zone.finalRadius - zone.initialRadius) * progress;
  }

  isOutside(zone: DangerZoneRuntimeState, x: number, y: number, now: number): boolean {
    const radius = this.radiusAt(zone, now);
    return (x - zone.centerX) ** 2 + (y - zone.centerY) ** 2 > radius ** 2;
  }

  private pickAxisCenter(length: number, edgeMarginPx: number): number {
    if (length <= edgeMarginPx * 2) return length / 2;
    return edgeMarginPx + Math.random() * (length - edgeMarginPx * 2);
  }

  private radiusCoveringMap(map: Pick<GameMap, 'width' | 'height'>, centerX: number, centerY: number): number {
    return Math.max(
      Math.hypot(centerX, centerY),
      Math.hypot(map.width - centerX, centerY),
      Math.hypot(centerX, map.height - centerY),
      Math.hypot(map.width - centerX, map.height - centerY),
    );
  }
}
