import { GameMap } from './types/map.types';
import { Player } from './types/player.types';
import { PowerUpSpawnService } from './power-up-spawn.service';

describe('PowerUpSpawnService', () => {
  let service: PowerUpSpawnService;

  beforeEach(() => {
    service = new PowerUpSpawnService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('scales the maximum active power-ups with player count', () => {
    expect(service.maxActiveForPlayerCount(1)).toBe(2);
    expect(service.maxActiveForPlayerCount(4)).toBe(2);
    expect(service.maxActiveForPlayerCount(8)).toBe(3);
    expect(service.maxActiveForPlayerCount(9)).toBe(4);
  });

  it('does not spawn when the map already has the allowed amount', () => {
    const map = createMap();
    map.powerUps = [
      { id: 'a', type: 'shotgun', assetId: 'power_shotgun', x: 200, y: 200, radius: 18, createdAt: 1 },
      { id: 'b', type: 'laser', assetId: 'power_laser', x: 700, y: 700, radius: 18, createdAt: 1 },
    ];

    expect(service.trySpawn(map, [createPlayer(100, 100)], 10_000)).toBeNull();
  });

  it('skips a spawn tick when all candidate positions are invalid', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const map = createMap();
    map.obstacles.push({
      id: 'center-rock',
      type: 'rock',
      x: 500,
      y: 500,
      width: 120,
      height: 120,
      hp: 100,
      maxHp: 100,
      healthRatio: 1,
      destructible: true,
    });

    expect(service.trySpawn(map, [createPlayer(100, 100)], 10_000)).toBeNull();
  });

  it('allows power-ups near blocking obstacles when they do not overlap', () => {
    jest.spyOn(Math, 'random')
      .mockReturnValueOnce(0.3755)
      .mockReturnValueOnce(0.5)
      .mockReturnValueOnce(0.1);
    const map = createMap();
    map.obstacles.push({
      id: 'center-rock',
      type: 'rock',
      x: 500,
      y: 500,
      width: 120,
      height: 120,
      hp: 100,
      maxHp: 100,
      healthRatio: 1,
      destructible: true,
    });

    const powerUp = service.trySpawn(map, [createPlayer(100, 100)], 10_000);

    expect(powerUp?.type).toBe('triple_shot');
    expect(powerUp?.x).toBeCloseTo(380, 0);
    expect(powerUp?.y).toBe(500);
  });

  it('allows power-ups to spawn over bushes and decorations', () => {
    jest.spyOn(Math, 'random')
      .mockReturnValueOnce(0.5)
      .mockReturnValueOnce(0.5)
      .mockReturnValueOnce(0.1);
    const map = createMap();
    map.obstacles.push(
      {
        id: 'center-bush',
        type: 'bush',
        x: 500,
        y: 500,
        width: 120,
        height: 120,
        hp: 34,
        maxHp: 34,
        healthRatio: 1,
        destructible: true,
      },
      {
        id: 'center-decoration',
        type: 'decoration',
        x: 500,
        y: 500,
        width: 120,
        height: 120,
        hp: 1,
        maxHp: 1,
        healthRatio: 1,
        destructible: false,
      },
    );

    const powerUp = service.trySpawn(map, [createPlayer(100, 100)], 10_000);

    expect(powerUp).toMatchObject({
      type: 'triple_shot',
      x: 500,
      y: 500,
    });
  });

  it('creates a weighted random power-up at a valid position', () => {
    jest.spyOn(Math, 'random')
      .mockReturnValueOnce(0.5)
      .mockReturnValueOnce(0.5)
      .mockReturnValueOnce(0.99);

    const powerUp = service.trySpawn(createMap(), [createPlayer(100, 100)], 10_000);

    expect(powerUp).toMatchObject({
      type: 'laser',
      assetId: 'power_laser',
      x: 500,
      y: 500,
      radius: 18,
      createdAt: 10_000,
    });
    expect(powerUp?.id).toEqual(expect.any(String));
  });

  it('validates pickups with the server-side pickup radius', () => {
    const powerUp = {
      id: 'power',
      type: 'shotgun' as const,
      assetId: 'power_shotgun',
      x: 100,
      y: 100,
      radius: 18,
      createdAt: 1,
    };

    expect(service.isPickupValid(createPlayer(145, 100), powerUp)).toBe(true);
    expect(service.isPickupValid(createPlayer(146, 100), powerUp)).toBe(false);
  });

  function createMap(): GameMap {
    return {
      width: 1000,
      height: 1000,
      spawnPoints: [{ x: 50, y: 50 }],
      obstacles: [],
      powerUps: [],
    };
  }

  function createPlayer(x: number, y: number): Player {
    return {
      id: 'player',
      username: 'Pilot',
      x,
      y,
      radius: 28,
      speed: 200,
      hp: 100,
      maxHp: 100,
      bodyAngle: 0,
      aimAngle: 0,
      color: 0xffffff,
      input: { moveX: 0, moveY: 0, aimAngle: 0, shoot: false, dash: false, reload: false, shield: false },
      weapon: {
        baseStats: {
          magazineSize: 6,
          fireCooldownMs: 300,
          reloadDurationMs: 1400,
          maxActiveBullets: 5,
          bulletSpeed: 600,
          bulletDamage: 20,
          bulletRadius: 6,
          bulletLifetimeMs: 1500,
        },
        state: {
          ammo: 6,
          lastFiredAt: 0,
          reloadsAt: 0,
        },
        modifiers: [],
      },
      lastDashAt: 0,
      dashUntil: 0,
      dashCooldown: 5000,
      shieldHp: 0,
      shieldUntil: 0,
      lastShieldAt: 0,
      alive: true,
    };
  }
});
