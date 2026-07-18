import { ConfigService } from '@nestjs/config';
import { envValidationSchema } from './env.validation';
import { DevelopmentSettingsService } from './development-settings.service';

describe('DevelopmentSettingsService', () => {
  it('returns the current fast development defaults in dev game mode', () => {
    const service = createService({
      NODE_ENV: 'development',
      DEV_GAME_MODE: true,
      DEV_INFRA_OPTIONAL: true,
      DEV_MANUAL_START: true,
    });

    expect(service.isDevGameMode()).toBe(true);
    expect(service.isManualStartEnabled()).toBe(true);
    expect(service.isInfraOptionalEnabled()).toBe(true);
    expect(service.isProductionEnvironment()).toBe(false);
    expect(service.shouldBypassRateLimits()).toBe(true);
    expect(service.shouldPersistMatches()).toBe(false);
    expect(service.shouldClearInitialPowerUpsOnStart()).toBe(false);
    expect(service.rooms()).toEqual({ minPlayers: 1, countdownSeconds: 3 });
    expect(service.dangerZoneOverride()).toMatchObject({
      warningStartsAtMs: 90_000,
      damageStartsAtMs: 120_000,
      targetDurationMs: 240_000,
      maxDurationMs: 360_000,
    });
    expect(service.powerUps()).toEqual({
      firstSpawnDelayMs: 3_000,
      spawnIntervalMs: 15_000,
    });
    expect(service.networkLogsEnabled()).toBe(false);
  });

  it('returns production-safe behavior when dev game mode is disabled', () => {
    const service = createService({
      NODE_ENV: 'production',
      DEV_GAME_MODE: false,
      DEV_INFRA_OPTIONAL: false,
      DEV_MANUAL_START: false,
    });

    expect(service.isDevGameMode()).toBe(false);
    expect(service.isManualStartEnabled()).toBe(false);
    expect(service.isInfraOptionalEnabled()).toBe(false);
    expect(service.isProductionEnvironment()).toBe(true);
    expect(service.shouldBypassRateLimits()).toBe(false);
    expect(service.shouldPersistMatches()).toBe(true);
    expect(service.shouldClearInitialPowerUpsOnStart()).toBe(true);
    expect(service.rooms()).toBeNull();
    expect(service.dangerZoneOverride()).toEqual({});
    expect(service.powerUps()).toBeNull();
  });

  it('keeps manual start independent from dev game mode', () => {
    const service = createService({
      NODE_ENV: 'development',
      DEV_GAME_MODE: true,
      DEV_INFRA_OPTIONAL: false,
      DEV_MANUAL_START: false,
    });

    expect(service.isDevGameMode()).toBe(true);
    expect(service.isManualStartEnabled()).toBe(false);
  });

  it('rejects development flags in production env validation', () => {
    const result = envValidationSchema.validate({
      NODE_ENV: 'production',
      DEV_GAME_MODE: true,
      DEV_INFRA_OPTIONAL: false,
      DEV_MANUAL_START: false,
      PORT: 3000,
      FRONTEND_ORIGIN: 'http://localhost:4200',
      DATABASE_URL: 'postgresql://user:password@localhost:5432/tank_arena?schema=public',
      REDIS_URL: 'redis://localhost:6379',
      JWT_ACCESS_SECRET: 'strong-access-secret-for-production',
      JWT_ONBOARDING_SECRET: 'strong-onboarding-secret-for-production',
      AUTH_PRIMARY_DOMAIN: 'example.com',
      AUTH_PRIMARY_URI: 'https://example.com',
      AUTH_ALLOWED_DOMAINS: 'example.com',
      GOOGLE_CLIENT_ID: 'client.apps.googleusercontent.com',
    });

    expect(result.error).toBeDefined();
  });

  function createService(values: Record<string, boolean | string>): DevelopmentSettingsService {
    const config = {
      get: jest.fn((key: string, fallback: boolean | string) => values[key] ?? fallback),
    };
    return new DevelopmentSettingsService(config as unknown as ConfigService);
  }
});
