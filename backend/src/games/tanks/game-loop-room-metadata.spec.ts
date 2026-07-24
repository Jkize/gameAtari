import { GameLoopService } from './game-loop.service';
import { GameRuntimeContext } from './runtime/game-runtime-context.service';
import { GameSessionsService } from './runtime/game-sessions.service';

describe('GameLoopService room metadata', () => {
  it('copies private-room reward eligibility into the authoritative game session', () => {
    const sessions = new GameSessionsService(new GameRuntimeContext());
    const gameService = {
      map: null as { name: string } | null,
      reset: jest.fn(),
      addPlayer: jest.fn(),
    };
    const map = { name: 'Arena' };
    const mapService = { createMap: jest.fn(() => map) };
    const loop = new GameLoopService(
      sessions,
      gameService as never,
      mapService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    loop.prepare('private-room', [{ userId: 'user-1', username: 'Pilot1' }], {
      roomName: 'Squad Room',
      roomType: 'private',
      rewardsEligible: false,
    });

    expect(sessions.require('private-room').rewardsEligible).toBe(false);
    expect(sessions.require('private-room')).toEqual(expect.objectContaining({
      roomName: 'Squad Room',
      roomType: 'private',
      roundId: expect.any(String),
    }));
    expect(gameService.reset).toHaveBeenCalledTimes(1);
    expect(mapService.createMap).toHaveBeenCalledWith(1);
    expect(gameService.addPlayer).toHaveBeenCalledWith('user-1', 'Pilot1');
  });

  it('includes the immutable tank appearance snapshot only in the initial state', () => {
    const sessions = new GameSessionsService(new GameRuntimeContext());
    const gameService = {
      map: null as { name: string; powerUps: never[] } | null,
      players: new Map(),
      bullets: [],
      status: 'waiting',
      impactEvents: [],
      dangerZone: null,
      reset: jest.fn(),
      addPlayer: jest.fn(),
    };
    const loop = new GameLoopService(
      sessions,
      gameService as never,
      { createMap: () => ({ name: 'Arena', powerUps: [] }) } as never,
      {} as never,
      { getPublicState: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      { buildPublicState: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const customization = {
      version: 1 as const,
      baseColor: '#f3d33b' as const,
      paint: {
        hull: { base: '#f3d33b' as const },
        turret: { base: '#3478f6' as const },
        tracks: { treadShadow: '#24c7d9' as const },
      },
    };
    loop.prepare('room-appearance', [{
      userId: 'user-1',
      username: 'Pilot1',
      tankCustomization: customization,
    }]);

    const initial = loop.buildInitialState('room-appearance');
    expect(initial.tankCustomizations).toEqual({ 'user-1': customization });
    expect(initial.state).not.toHaveProperty('tankCustomizations');
  });

  it('snapshots the reward player count when the round starts', () => {
    const sessions = new GameSessionsService(new GameRuntimeContext());
    sessions.create('reward-room');
    const gameService = {
      map: { powerUps: [] },
      players: new Map(Array.from({ length: 9 }, (_, index) => [
        `player-${index}`,
        { id: `player-${index}` },
      ])),
      status: 'waiting',
      dangerZone: null,
    };
    const dangerZone = {
      createRuntimeState: jest.fn(() => ({ phase: 'waiting' })),
    };
    const developmentSettings = {
      dangerZoneOverride: jest.fn(() => ({})),
      shouldClearInitialPowerUpsOnStart: jest.fn(() => false),
      powerUps: jest.fn(() => ({
        firstSpawnDelayMs: 3_000,
        spawnIntervalMs: 15_000,
      })),
    };
    const loop = new GameLoopService(
      sessions,
      gameService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      dangerZone as never,
      developmentSettings as never,
      {} as never,
      {} as never,
    );

    loop.start('reward-room');

    expect(sessions.require('reward-room').rewardPlayerCount).toBe(9);
    expect(sessions.require('reward-room').startedAt).toBeInstanceOf(Date);
    loop.stop('reward-room');
  });

  it('passes the authoritative winner to the finished handler', () => {
    const sessions = new GameSessionsService(new GameRuntimeContext());
    const state = sessions.create('room-1');
    state.stats.set('winner', {} as never);
    state.stats.set('eliminated', {} as never);
    const gameService = {
      status: 'playing',
      players: new Map([
        ['winner', { id: 'winner', alive: true }],
        ['eliminated', { id: 'eliminated', alive: false }],
      ]),
    };
    const loop = new GameLoopService(
      sessions,
      gameService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const finished = jest.fn();
    loop.onFinished(finished);

    (loop as unknown as { checkWinCondition(roomId: string): void })
      .checkWinCondition('room-1');

    expect(gameService.status).toBe('finished');
    expect(state.endedAt).toBeInstanceOf(Date);
    expect(finished).toHaveBeenCalledWith('room-1', 'winner');
  });

  it('returns a snapshot of the authoritative round statistics', () => {
    const sessions = new GameSessionsService(new GameRuntimeContext());
    const state = sessions.create('room-stats');
    state.stats.set('user-1', {
      kills: 3,
      deaths: 1,
      damageDealt: 900,
      damageTaken: 250,
    });
    const loop = new GameLoopService(
      sessions,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    expect(loop.roundStats('room-stats')).toEqual({
      'user-1': {
        kills: 3,
        deaths: 1,
        damageDealt: 900,
        damageTaken: 250,
      },
    });
  });

  it('returns empty round statistics when the game session does not exist', () => {
    const sessions = new GameSessionsService(new GameRuntimeContext());
    const loop = new GameLoopService(
      sessions,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    expect(loop.roundStats('missing-room')).toEqual({});
  });
});
