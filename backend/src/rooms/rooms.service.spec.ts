import { SESSION_MESSAGES, SOCKET_EVENTS } from '../common/socket-events';
import { RoomDevelopmentSettings } from '../config/development-settings.service';
import { MAX_PLAYERS, PROD_MIN_PLAYERS, RoomsService } from './rooms.service';

describe('RoomsService', () => {
  const createHarness = (devGameMode = false) => {
    const gameLoop = {
      hasSession: jest.fn(() => false),
      removePlayer: jest.fn(),
      remove: jest.fn(),
      prepare: jest.fn(),
      start: jest.fn(),
      buildState: jest.fn(),
      isPlayerAlive: jest.fn(() => true),
    };
    const redis = {
      set: jest.fn(async () => undefined),
      del: jest.fn(async () => undefined),
      client: {
        set: jest.fn(async () => 'OK'),
        del: jest.fn(async () => 1),
      },
    };
    const roomEmit = jest.fn();
    const server = {
      to: jest.fn(() => ({ emit: roomEmit })),
      sockets: { sockets: new Map() },
    };
    const developmentSettings = {
      rooms: jest.fn((): RoomDevelopmentSettings | null => devGameMode
        ? { minPlayers: 1, countdownSeconds: 3 }
        : null),
    };
    const rooms = new RoomsService(gameLoop as never, redis as never, developmentSettings as never);
    rooms.setServer(server as never);
    return { gameLoop, redis, server, roomEmit, rooms };
  };

  it('uses the configured 2-15 player limits and sends player 16 to another quick-play room', async () => {
    jest.useFakeTimers();
    const { rooms } = createHarness(true);

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
    expect(MAX_PLAYERS).toBe(15);
    expect(list).toHaveLength(2);
    expect(list.map(room => room.playerCount).sort((a, b) => b - a)).toEqual([15, 1]);
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('reattaches a new socket to the same player during an active game', async () => {
    jest.useFakeTimers();
    const { rooms } = createHarness();
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

  it('notifies duplicate tabs when a new socket claims the same player session', async () => {
    jest.useFakeTimers();
    const { rooms, server } = createHarness();
    const firstSocket = {
      id: 'socket-original-tab',
      data: {},
      join: jest.fn(),
      emit: jest.fn(),
      disconnect: jest.fn(),
    };
    server.sockets.sockets.set(firstSocket.id, firstSocket);
    await rooms.quickPlay(firstSocket as never, {
      userId: 'same-user',
      username: 'Pilot',
    });

    const secondSocket = {
      id: 'socket-new-tab',
      data: {},
      join: jest.fn(),
      emit: jest.fn(),
    };
    rooms.reconnectCurrent(secondSocket as never, {
      userId: 'same-user',
      username: 'Pilot',
    });

    expect(firstSocket.emit).toHaveBeenCalledWith(SOCKET_EVENTS.SESSION.REPLACED, {
      reason: 'duplicate_tab',
      message: SESSION_MESSAGES.REPLACED,
    });
    expect(firstSocket.disconnect).toHaveBeenCalledWith(true);
    expect(secondSocket.emit).toHaveBeenCalledWith(SOCKET_EVENTS.SESSION.CLAIMED, {
      reason: 'duplicate_tab',
      message: SESSION_MESSAGES.CLAIMED,
    });
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('keeps the player in the room when the replaced socket disconnects during session claim', async () => {
    jest.useFakeTimers();
    const { rooms, server } = createHarness();
    const firstSocket = {
      id: 'socket-original-tab',
      data: {},
      join: jest.fn(),
      emit: jest.fn(),
      disconnect: jest.fn(() => {
        void rooms.disconnect('same-user', 'socket-original-tab');
      }),
    };
    server.sockets.sockets.set(firstSocket.id, firstSocket);
    await rooms.quickPlay(firstSocket as never, {
      userId: 'same-user',
      username: 'Pilot',
    });
    const room = rooms.roomForUser('same-user')!;

    const secondSocket = {
      id: 'socket-new-tab',
      data: {},
      join: jest.fn(),
      emit: jest.fn(),
    };
    rooms.reconnectCurrent(secondSocket as never, {
      userId: 'same-user',
      username: 'Pilot',
    });

    expect(rooms.roomForUser('same-user')?.id).toBe(room.id);
    expect(room.players.size).toBe(1);
    expect(room.players.get('same-user')?.socketId).toBe(secondSocket.id);
    expect(rooms.list()[0].playerCount).toBe(1);
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('uses 2 players as the production minimum and waits below that threshold', async () => {
    jest.useFakeTimers().setSystemTime(1_000);
    const { rooms } = createHarness(false);

    await rooms.quickPlay(socket(1) as never, user(1));

    const room = rooms.roomForUser('user-1')!;
    expect(PROD_MIN_PLAYERS).toBe(2);
    expect(rooms.list()[0].minPlayers).toBe(PROD_MIN_PLAYERS);
    expect(room.status).toBe('waiting');
    expect(room.countdownEndsAt).toBeUndefined();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('starts a 40 second countdown at 2 production players', async () => {
    jest.useFakeTimers().setSystemTime(1_000);
    const { rooms } = createHarness(false);

    for (let index = 1; index <= 2; index++) {
      await rooms.quickPlay(socket(index) as never, user(index));
    }

    const room = rooms.roomForUser('user-1')!;
    expect(room.status).toBe('countdown');
    expect(room.countdownEndsAt).toBe(41_000);
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('shortens countdown to 20 seconds at 8 players only when earlier', async () => {
    jest.useFakeTimers().setSystemTime(1_000);
    const { rooms } = createHarness(false);

    for (let index = 1; index <= 2; index++) {
      await rooms.quickPlay(socket(index) as never, user(index));
    }
    const room = rooms.roomForUser('user-1')!;
    expect(room.countdownEndsAt).toBe(41_000);

    jest.setSystemTime(10_000);
    for (let index = 3; index <= 8; index++) {
      await rooms.quickPlay(socket(index) as never, user(index));
    }
    expect(room.countdownEndsAt).toBe(30_000);

    jest.setSystemTime(25_000);
    await rooms.quickPlay(socket(9) as never, user(9));
    expect(room.countdownEndsAt).toBe(30_000);
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('shortens countdown to 10 seconds at 15 players and sends player 16 to another room', async () => {
    jest.useFakeTimers().setSystemTime(1_000);
    const { rooms } = createHarness(false);

    for (let index = 1; index <= 2; index++) {
      await rooms.quickPlay(socket(index) as never, user(index));
    }
    const firstRoom = rooms.roomForUser('user-1')!;

    jest.setSystemTime(5_000);
    for (let index = 3; index <= 15; index++) {
      await rooms.quickPlay(socket(index) as never, user(index));
    }
    await rooms.quickPlay(socket(16) as never, user(16));

    expect(firstRoom.players.size).toBe(15);
    expect(firstRoom.countdownEndsAt).toBe(15_000);
    expect(rooms.roomForUser('user-16')!.id).not.toBe(firstRoom.id);
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('cancels countdown when production room drops below 2 players', async () => {
    jest.useFakeTimers().setSystemTime(1_000);
    const { rooms } = createHarness(false);

    for (let index = 1; index <= 2; index++) {
      await rooms.quickPlay(socket(index) as never, user(index));
    }
    const room = rooms.roomForUser('user-1')!;
    expect(room.status).toBe('countdown');

    await rooms.leave('user-2');

    expect(room.status).toBe('waiting');
    expect(room.countdownEndsAt).toBeUndefined();
    expect(room.countdownTimer).toBeUndefined();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('releases players to the lobby after a finished round instead of queueing again', async () => {
    jest.useFakeTimers().setSystemTime(1_000);
    const { rooms, gameLoop, server } = createHarness(false);
    const playerSockets = Array.from({ length: 2 }, (_, index) => ({
      id: `socket-${index + 1}`,
      data: {},
      join: jest.fn(),
      leave: jest.fn(),
      emit: jest.fn(),
    }));

    for (let index = 1; index <= 2; index++) {
      const playerSocket = playerSockets[index - 1];
      server.sockets.sockets.set(playerSocket.id, playerSocket);
      await rooms.quickPlay(playerSocket as never, user(index));
    }

    const room = rooms.roomForUser('user-1')!;
    gameLoop.buildState.mockReturnValue({
      players: [{ id: 'user-1', alive: true }],
    });

    await rooms.finish(room.id);
    jest.advanceTimersByTime(5_000);

    expect(rooms.list()).toHaveLength(0);
    expect(rooms.roomForUser('user-1')).toBeUndefined();
    expect(rooms.roomForUser('user-2')).toBeUndefined();
    expect(gameLoop.remove).toHaveBeenCalledWith(room.id);
    for (const playerSocket of playerSockets) {
      expect(playerSocket.leave).toHaveBeenCalledWith(`game:${room.id}:players`);
      expect(playerSocket.emit).toHaveBeenCalledWith(SOCKET_EVENTS.ROOM.LEFT, { reason: 'round_finished' });
    }
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('uses 1 player as the development minimum', async () => {
    jest.useFakeTimers().setSystemTime(1_000);
    const { rooms } = createHarness(true);

    await rooms.quickPlay(socket(1) as never, user(1));

    const room = rooms.roomForUser('user-1')!;
    expect(rooms.list()[0].minPlayers).toBe(1);
    expect(room.status).toBe('countdown');
    expect(room.countdownEndsAt).toBe(4_000);
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('creates named development rooms from URL slugs', async () => {
    jest.useFakeTimers();
    const { rooms } = createHarness(true);

    const state = await rooms.joinDevelopmentRoom('test1', socket(1) as never, user(1));

    expect(state.id).toBe('dev-test1');
    expect(state.name).toBe('Sala test1');
    expect(rooms.roomForUser('user-1')?.id).toBe('dev-test1');
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('quick play prefers fuller available rooms before older emptier rooms', async () => {
    jest.useFakeTimers();
    const { rooms } = createHarness(false);

    await rooms.create(socket(1) as never, user(1), 'Older empty');
    await rooms.quickPlay(socket(2) as never, user(2));
    await rooms.quickPlay(socket(3) as never, user(3));

    await rooms.leave('user-1');
    await rooms.quickPlay(socket(4) as never, user(4));

    expect(rooms.roomForUser('user-4')!.id).toBe(rooms.roomForUser('user-2')!.id);
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  function socket(index: number) {
    return {
      id: `socket-${index}`,
      data: {},
      join: jest.fn(),
    };
  }

  function user(index: number) {
    return {
      userId: `user-${index}`,
      username: `Pilot${index}`,
    };
  }
});
