import type Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';
import type { GameState, PlayerPublicState } from '../../types/game-state.types';
import { StateChangeTracker } from './state-change-tracker';

describe('StateChangeTracker shield impact audio', () => {
  it('plays the authoritative shield impact once without the shieldHp fallback', () => {
    const { tracker, audio } = createTracker();
    tracker.check(createState(100), 'me');

    tracker.check(createState(80, [{
      id: 'bullet-1:0',
      bulletId: 'bullet-1',
      material: 'shield',
      x: 100,
      y: 100,
    }]), 'me');

    expect(audio.playBulletImpact).toHaveBeenCalledOnce();
    expect(audio.playBulletImpact).toHaveBeenCalledWith(
      'shield',
      expect.objectContaining({ bulletId: 'bullet-1' }),
      expect.objectContaining({ id: 'me' }),
    );
    expect(audio.playShieldHit).not.toHaveBeenCalled();
  });

  it('uses the shieldHp fallback once when no direct impact event exists', () => {
    const { tracker, audio } = createTracker();
    tracker.check(createState(100), 'me');

    tracker.check(createState(80), 'me');

    expect(audio.playBulletImpact).not.toHaveBeenCalled();
    expect(audio.playShieldHit).toHaveBeenCalledOnce();
    expect(audio.playShieldHit).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'me', shieldHp: 80 }),
      expect.objectContaining({ id: 'me' }),
      true,
    );
  });
});

function createTracker() {
  const scene = {
    time: { now: 1_000 },
    cameras: { main: { shake: vi.fn() } },
  } as unknown as Phaser.Scene;
  const effects = {
    spawnExplosion: vi.fn(),
    spawnGrenadeExplosion: vi.fn(),
    spawnSpark: vi.fn(),
    spawnPowerPickupBurst: vi.fn(),
  };
  const obstacleRenderer = { ensure: vi.fn(), remove: vi.fn() };
  const powerUpRenderer = { ensure: vi.fn(), get: vi.fn(), remove: vi.fn() };
  const playerRenderer = { recordPlayerState: vi.fn(), remove: vi.fn() };
  const audio = {
    syncShieldLoops: vi.fn(),
    stopShieldLoop: vi.fn(),
    playBulletImpact: vi.fn(),
    playShieldHit: vi.fn(),
    playShieldLaunch: vi.fn(),
    playDash: vi.fn(),
    playGrenadeExplosion: vi.fn(),
    playPowerUpPickup: vi.fn(),
    playReloadStart: vi.fn(),
    playReloadComplete: vi.fn(),
    playLaserFire: vi.fn(),
    playGrenadeLaunch: vi.fn(),
    playWeaponFire: vi.fn(),
    playLaserReflect: vi.fn(),
  };
  const tracker = new StateChangeTracker(
    scene,
    effects as never,
    obstacleRenderer as never,
    powerUpRenderer as never,
    playerRenderer as never,
    audio as never,
  );
  return { tracker, audio };
}

function createState(
  shieldHp: number,
  impactEvents: GameState['impactEvents'] = [],
): GameState {
  const player: PlayerPublicState = {
    id: 'me',
    x: 100,
    y: 100,
    radius: 20,
    hp: 100,
    maxHp: 100,
    bodyAngle: 0,
    aimAngle: 0,
    color: 0xffffff,
    dashCooldownMs: 0,
    weapon: { ammo: 5, magazineSize: 5, reloadMs: 0, fireCooldownMs: 0 },
    dashing: false,
    alive: true,
    shielding: shieldHp > 0,
    shieldHp,
    shieldMaxHp: 100,
    shieldCooldownMs: 0,
    shieldRemainingMs: 5_000,
  };
  return {
    status: 'playing',
    players: [player],
    bullets: [],
    powerUps: [],
    impactEvents,
    map: { width: 1_000, height: 1_000, obstacles: [], powerUps: [] },
  };
}
