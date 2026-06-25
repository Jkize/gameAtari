import { RoomsService, MAX_PLAYERS, MIN_PLAYERS } from './rooms.service';

describe('RoomsService', () => {
  const gameLoop = {
    hasSession: jest.fn(() => false),
    removePlayer: jest.fn(),
    remove: jest.fn(),
    prepare: jest.fn(),
    start: jest.fn(),
    buildState: jest.fn(),
  };
  const redis = {
    set: jest.fn(async () => undefined),
    del: jest.fn(async () => undefined),
    client: {
      set: jest.fn(async () => 'OK'),
      del: jest.fn(async () => 1),
    },
  };
  const server = {
    to: jest.fn(() => ({ emit: jest.fn() })),
    sockets: { sockets: new Map() },
  };

  it('uses the configured 2-15 player limits and sends player 16 to another quick-play room', async () => {
    jest.useFakeTimers();
    const rooms = new RoomsService(gameLoop as never, redis as never);
    rooms.setServer(server as never);

    for (let index = 1; index <= 16; index++) {
      const socket = {
        id: `socket-${index}`,
        data: {},
        join: jest.fn(),
      };
      await rooms.quickPlay(socket as never, {
        userId: `user-${index}`,
        username: `Pilot${index}`,
      });
    }

    const list = rooms.list();
    expect(MIN_PLAYERS).toBe(2);
    expect(MAX_PLAYERS).toBe(15);
    expect(list).toHaveLength(2);
    expect(list.map(room => room.playerCount).sort((a, b) => b - a)).toEqual([15, 1]);
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('reattaches a new socket to the same player during an active game', async () => {
    jest.useFakeTimers();
    const rooms = new RoomsService(gameLoop as never, redis as never);
    rooms.setServer(server as never);
    const firstSocket = {
      id: 'socket-before-refresh',
      data: {},
      join: jest.fn(),
    };
    await rooms.quickPlay(firstSocket as never, {
      userId: 'same-user',
      username: 'Pilot',
    });
    const room = rooms.roomForUser('same-user')!;
    room.status = 'in_game';

    await rooms.disconnect('same-user', firstSocket.id);
    expect(room.players.get('same-user')?.socketId).toBeNull();

    const refreshedSocket = {
      id: 'socket-after-refresh',
      data: {},
      join: jest.fn(),
      emit: jest.fn(),
    };
    const state = rooms.reconnectCurrent(refreshedSocket as never, {
      userId: 'same-user',
      username: 'Pilot',
    });

    expect(state?.id).toBe(room.id);
    expect(room.players.get('same-user')?.socketId).toBe(refreshedSocket.id);
    expect(refreshedSocket.join).toHaveBeenCalledWith(`game:${room.id}:players`);
    jest.clearAllTimers();
    jest.useRealTimers();
  });
});
