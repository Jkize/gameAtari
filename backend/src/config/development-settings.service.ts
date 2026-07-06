import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DangerZoneConfig } from '../games/tanks/danger-zone.service';

export interface RoomDevelopmentSettings {
  minPlayers: number;
  countdownSeconds: number;
}

export interface PowerUpDevelopmentSettings {
  firstSpawnDelayMs: number;
  spawnIntervalMs: number;
}

const DEV_ROOM_SETTINGS: RoomDevelopmentSettings = {
  minPlayers: 1,
  countdownSeconds: 3,
};

const DEV_DANGER_ZONE_OVERRIDE: Partial<DangerZoneConfig> = {
  warningStartsAtMs: 90_000,
  damageStartsAtMs: 10_000,
  targetDurationMs: 45_000,
  maxDurationMs: 70_000,
  shrinkEveryMs: 5_000,
  finalHoldMs: 8_000,
  suddenDeathShrinkMs: 12_000,
};

const DEV_POWER_UP_SETTINGS: PowerUpDevelopmentSettings = {
  firstSpawnDelayMs: 3_000,
  spawnIntervalMs: 15_000,
};

@Injectable()
export class DevelopmentSettingsService {
  constructor(private readonly config: ConfigService) {}

  isDevGameMode(): boolean {
    return this.config.get<boolean>('DEV_GAME_MODE', false);
  }

  isManualStartEnabled(): boolean {
    return this.config.get<boolean>('DEV_MANUAL_START', false);
  }

  isInfraOptionalEnabled(): boolean {
    return this.config.get<boolean>('DEV_INFRA_OPTIONAL', false);
  }

  isProductionEnvironment(): boolean {
    return this.config.get<string>('NODE_ENV', 'development') === 'production';
  }

  shouldBypassRateLimits(): boolean {
    return this.isDevGameMode();
  }

  shouldPersistMatches(): boolean {
    return !this.isDevGameMode();
  }

  shouldClearInitialPowerUpsOnStart(): boolean {
    return !this.isDevGameMode();
  }

  rooms(): RoomDevelopmentSettings | null {
    return this.isDevGameMode() ? DEV_ROOM_SETTINGS : null;
  }

  dangerZoneOverride(): Partial<DangerZoneConfig> {
    return this.isDevGameMode() ? DEV_DANGER_ZONE_OVERRIDE : {};
  }

  powerUps(): PowerUpDevelopmentSettings | null {
    return this.isDevGameMode() ? DEV_POWER_UP_SETTINGS : null;
  }

  networkLogsEnabled(): boolean {
    return false;
  }
}
