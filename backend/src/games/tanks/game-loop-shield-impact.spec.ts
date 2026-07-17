import { GameLoopService } from './game-loop.service';
import type { Bullet } from './types/bullet.types';
import type { BulletImpactPublicState } from './types/game-state.types';
import type { Player } from './types/player.types';

describe('GameLoopService shield impact material', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([
    { shieldHp: 50, shieldUntilOffset: 5_000, expectedMaterial: 'shield' },
    { shieldHp: 0, shieldUntilOffset: 0, expectedMaterial: 'spark' },
  ] as const)(
    'records $expectedMaterial when shieldHp is $shieldHp',
    ({ shieldHp, shieldUntilOffset, expectedMaterial }) => {
      const now = 100_000;
      jest.spyOn(Date, 'now').mockReturnValue(now);
      const player = createPlayer(shieldHp, now + shieldUntilOffset);
      const bullet = createBullet();
      const impactEvents: BulletImpactPublicState[] = [];
      const gameService = {
        players: new Map([[player.id, player]]),
        bullets: [bullet],
        map: { width: 1_000, height: 1_000, obstacles: [] },
        impactEvents,
        damagePlayer: jest.fn(),
      };
      const collisionService = {
        isBulletOutOfBounds: jest.fn().mockReturnValue(false),
        bulletVsPlayer: jest.fn().mockReturnValue(true),
      };
      const loop = new GameLoopService(
        {} as never,
        gameService as never,
        {} as never,
        collisionService as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );

      (loop as unknown as { processBullets(roomId: string, deltaTime: number): void })
        .processBullets('room', 0);

      expect(gameService.damagePlayer).toHaveBeenCalledWith(
        player,
        bullet.damage,
        expect.objectContaining({ attackerId: bullet.ownerId }),
        now,
      );
      expect(impactEvents).toEqual([
        expect.objectContaining({ bulletId: bullet.id, material: expectedMaterial }),
      ]);
      expect(impactEvents).not.toEqual([
        expect.objectContaining({
          material: expectedMaterial === 'shield' ? 'spark' : 'shield',
        }),
      ]);
    },
  );
});

function createBullet(): Bullet {
  return {
    id: 'bullet-1',
    ownerId: 'attacker',
    kind: 'standard',
    x: 100,
    y: 100,
    dirX: 1,
    dirY: 0,
    speed: 0,
    damage: 10,
    radius: 4,
    lifeTime: 1_000,
  };
}

function createPlayer(shieldHp: number, shieldUntil: number): Player {
  return {
    id: 'victim',
    x: 100,
    y: 100,
    radius: 20,
    speed: 100,
    hp: 100,
    maxHp: 100,
    bodyAngle: 0,
    aimAngle: 0,
    color: 0xffffff,
    input: { moveX: 0, moveY: 0, aimAngle: 0, shoot: false, dash: false, reload: false, shield: false },
    weapon: {} as Player['weapon'],
    lastDashAt: 0,
    dashUntil: 0,
    dashCooldown: 0,
    shieldHp,
    shieldUntil,
    lastShieldAt: 0,
    lastCombatAt: 0,
    healthRegenCarry: 0,
    alive: true,
  };
}
