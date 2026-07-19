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

    loop.prepare('private-room', [{ userId: 'user-1', username: 'Pilot1' }], false);

    expect(sessions.require('private-room').rewardsEligible).toBe(false);
    expect(gameService.reset).toHaveBeenCalledTimes(1);
    expect(mapService.createMap).toHaveBeenCalledWith(1);
    expect(gameService.addPlayer).toHaveBeenCalledWith('user-1', 'Pilot1');
  });
});
