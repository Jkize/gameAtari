import { Injectable } from '@nestjs/common';
import {
  DANGER_ZONE_CONFIGS_BY_PLAYER_TIER,
  DANGER_ZONE_EDGE_MARGIN_PX,
  DANGER_ZONE_INITIAL_RADIUS_MAP_PADDING_PX,
  DANGER_ZONE_WARNING_MESSAGE,
  DangerZoneConfig,
} from './config/danger-zone.config';
import { GameMap } from './types/map.types';

export type DangerZonePhase = 'inactive' | 'warning' | 'active' | 'final' | 'sudden_death';

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
    const center = this.pickCenter(map, DANGER_ZONE_EDGE_MARGIN_PX);
    const initialRadius = Math.max(
      config.initialRadius,
      this.radiusCoveringMap(map, center.x, center.y) + DANGER_ZONE_INITIAL_RADIUS_MAP_PADDING_PX,
    );

    return {
      enabled: true,
      edgeMarginPx: DANGER_ZONE_EDGE_MARGIN_PX,
      warningMessage: DANGER_ZONE_WARNING_MESSAGE,
      startedAtMs,
      centerX: center.x,
      centerY: center.y,
      damageCarryByPlayerId: {},
      ...config,
      initialRadius,
    };
  }

  configForPlayerCount(playerCount: number): DangerZoneConfig {
    if (playerCount <= 4) return DANGER_ZONE_CONFIGS_BY_PLAYER_TIER[4];
    if (playerCount <= 8) return DANGER_ZONE_CONFIGS_BY_PLAYER_TIER[8];
    return DANGER_ZONE_CONFIGS_BY_PLAYER_TIER[16];
  }

  pickCenter(
    map: Pick<GameMap, 'width' | 'height'>,
    edgeMarginPx = DANGER_ZONE_EDGE_MARGIN_PX,
  ): { x: number; y: number } {
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
