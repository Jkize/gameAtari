import { Injectable } from '@nestjs/common';
import { GameMap } from './types/map.types';

export type DangerZonePhase = 'inactive' | 'warning' | 'active' | 'final';

export interface DangerZoneConfig {
  targetDurationMs: number;
  maxDurationMs: number;
  warningStartsAtMs: number;
  damageStartsAtMs: number;
  shrinkEveryMs: number;
  initialRadius: number;
  finalRadius: number;
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
  initialRadius: number;
  finalRadius: number;
  damagePerSecond: number;
  warningMessage: string;
  startedAtMs: number;
  warningStartsAtMs: number;
  damageStartsAtMs: number;
  targetDurationMs: number;
  nextShrinkAtMs?: number;
}

const EDGE_MARGIN_PX = 300;
const INITIAL_RADIUS_MAP_PADDING_PX = 10;
const WARNING_MESSAGE = 'LA ZONA SE ESTA CERRANDO';

const CONFIGS_BY_PLAYER_TIER: Record<4 | 8 | 16, DangerZoneConfig> = {
  4: {
    targetDurationMs: 240_000,
    maxDurationMs: 360_000,
    warningStartsAtMs: 90_000,
    damageStartsAtMs: 120_000,
    shrinkEveryMs: 35_000,
    initialRadius: 900,
    finalRadius: 220,
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
    const elapsedMs = Math.max(0, now - zone.startedAtMs);
    const phase = this.phaseAt(zone, now);
    const radius = this.radiusAt(zone, now);

    return {
      phase,
      centerX: zone.centerX,
      centerY: zone.centerY,
      radius,
      initialRadius: zone.initialRadius,
      finalRadius: zone.finalRadius,
      damagePerSecond: zone.damagePerSecond,
      warningMessage: zone.warningMessage,
      startedAtMs: zone.startedAtMs,
      warningStartsAtMs: zone.warningStartsAtMs,
      damageStartsAtMs: zone.damageStartsAtMs,
      targetDurationMs: zone.targetDurationMs,
      nextShrinkAtMs: phase === 'active'
        ? zone.startedAtMs + zone.damageStartsAtMs +
          (Math.floor(Math.max(0, elapsedMs - zone.damageStartsAtMs) / zone.shrinkEveryMs) + 1) * zone.shrinkEveryMs
        : undefined,
    };
  }

  phaseAt(zone: DangerZoneRuntimeState, now: number): DangerZonePhase {
    const elapsedMs = Math.max(0, now - zone.startedAtMs);
    if (elapsedMs < zone.warningStartsAtMs) return 'inactive';
    if (elapsedMs < zone.damageStartsAtMs) return 'warning';
    if (this.radiusAt(zone, now) <= zone.finalRadius) return 'final';
    return 'active';
  }

  radiusAt(zone: DangerZoneRuntimeState, now: number): number {
    const elapsedMs = Math.max(0, now - zone.startedAtMs);
    if (elapsedMs < zone.damageStartsAtMs) return zone.initialRadius;

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
