import { AuthProvider, UserRole } from '@prisma/client';
import { SOCKET_EVENTS } from '../../common/socket-events';
import { GameGateway } from './game.gateway';

jest.mock('../../matches/matches.service', () => ({
  MatchesService: class MatchesService {},
}));

describe('GameGateway watch access', () => {
  const createHarness = (role: UserRole) => {
    const initial = {
      map: { width: 100, height: 100, obstacles: [], powerUps: [] },
      state: {
        status: 'playing',
        players: [],
        bullets: [],
        powerUps: [],
        impactEvents: [],
      },
    };
    const gameLoop = {
      hasSession: jest.fn(() => true),
      buildInitialState: jest.fn(() => initial),
    };
    const watcherPresence = {
      join: jest.fn(async () => undefined),
      sendCurrent: jest.fn(),
    };
    const gateway = new GameGateway(
      {} as never,
      {} as never,
      gameLoop as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      watcherPresence as never,
    );
    const client = {
      data: {
        auth: {
          userId: 'viewer-1',
          sessionId: 'session-1',
          username: 'Viewer',
          provider: AuthProvider.GOOGLE,
          role,
        },
      },
      emit: jest.fn(),
    };

    return { client, gameLoop, initial, gateway, watcherPresence };
  };

  it('rejects a regular user before joining the external watcher room', async () => {
    const { client, gameLoop, gateway, watcherPresence } = createHarness(UserRole.USER);

    await gateway.watchGame(client as never, { roomId: 'room-1' });

    expect(client.emit).toHaveBeenCalledWith(SOCKET_EVENTS.GAME.ERROR, {
      code: 'WATCH_ADMIN_ONLY',
      message: 'Watching games is currently restricted to administrators',
    });
    expect(gameLoop.hasSession).not.toHaveBeenCalled();
    expect(watcherPresence.join).not.toHaveBeenCalled();
    expect(watcherPresence.sendCurrent).not.toHaveBeenCalled();
  });

  it('allows an admin to join and receive the watched game state', async () => {
    const { client, gameLoop, initial, gateway, watcherPresence } = createHarness(UserRole.ADMIN);

    await gateway.watchGame(client as never, { roomId: 'room-1' });

    expect(gameLoop.hasSession).toHaveBeenCalledWith('room-1');
    expect(watcherPresence.join).toHaveBeenCalledWith(client, 'room-1');
    expect(client.emit).toHaveBeenCalledWith(SOCKET_EVENTS.GAME.WATCH_JOINED, {
      watcherId: 'viewer-1',
      roomId: 'room-1',
      map: initial.map,
      status: initial.state.status,
    });
    expect(client.emit).toHaveBeenCalledWith(SOCKET_EVENTS.GAME.STATE, initial.state);
    expect(watcherPresence.sendCurrent).toHaveBeenCalledWith(client, 'room-1');
  });
});
