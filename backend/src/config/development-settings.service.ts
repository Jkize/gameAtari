import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DangerZoneConfig,
  DEVELOPMENT_DANGER_ZONE_OVERRIDE,
} from '../games/tanks/config/danger-zone.config';
import {
  DEV_ROOM_SETTINGS,
  RoomWaitingConfig,
} from '../games/tanks/config/room.config';

export type RoomDevelopmentSettings = RoomWaitingConfig;

export interface PowerUpDevelopmentSettings {
  firstSpawnDelayMs: number;
  spawnIntervalMs: number;
}

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
    return this.isDevGameMode() ? DEVELOPMENT_DANGER_ZONE_OVERRIDE : {};
  }

  powerUps(): PowerUpDevelopmentSettings | null {
    return this.isDevGameMode() ? DEV_POWER_UP_SETTINGS : null;
  }

  networkLogsEnabled(): boolean {
    return false;
  }
}
