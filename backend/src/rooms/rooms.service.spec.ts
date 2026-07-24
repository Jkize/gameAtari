import { SESSION_MESSAGES, SOCKET_EVENTS } from '../common/socket-events';
import { RoomDevelopmentSettings } from '../config/development-settings.service';
import {
  MAX_PLAYERS,
  PRIVATE_ROOM_COUNTDOWN_SECONDS,
  PRIVATE_ROOM_CLOSING_WARNING_MS,
  PRIVATE_ROOM_INACTIVITY_MS,
  PROD_MIN_PLAYERS,
  RECONNECT_GRACE_MS,
  ROUND_RESET_MS,
} from '../games/tanks/config/room.config';
import { RoomsService } from './rooms.service';

describe('RoomsService', () => {
  const createHarness = (devGameMode = false) => {
    const gameLoop = {
      hasSession: jest.fn(() => false),
      removePlayer: jest.fn(),
      remove: jest.fn(),
      prepare: jest.fn(),
      start: jest.fn(),
      buildState: jest.fn(),
      buildInitialState: jest.fn(() => ({
        map: { name: 'Arena' },
        state: { status: 'playing' },
      })),
      isPlayerAlive: jest.fn(() => true),
      roundStats: jest.fn(() => ({})),
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
    const watcherPresence = {
      stopWatching: jest.fn(),
      sendCurrent: jest.fn(),
    };
    const runtimeActivity = {
      playerConnected: jest.fn(),
      playerDisconnected: jest.fn(),
    };
    const rooms = new RoomsService(
      gameLoop as never,
      redis as never,
      watcherPresence as never,
      runtimeActivity as never,
      developmentSettings as never,
    );
    rooms.setServer(server as never);
    return { gameLoop, redis, server, roomEmit, watcherPresence, rooms };
  };

  it('uses the configured 2-16 player limits and sends player 17 to another quick-play room', async () => {
    jest.useFakeTimers();
    const { rooms } = createHarness(true);

    for (let index = 1; index <= 17; index++) {
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
    expect(MAX_PLAYERS).toBe(16);
    expect(list).toHaveLength(2);
    expect(list.map(room => room.playerCount).sort((a, b) => b - a)).toEqual([16, 1]);
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

  it('shortens countdown to 10 seconds at 15 players and sends player 17 to another room', async () => {
    jest.useFakeTimers().setSystemTime(1_000);
    const { rooms } = createHarness(false);

    for (let index = 1; index <= 2; index++) {
      await rooms.quickPlay(socket(index) as never, user(index));
    }
    const firstRoom = rooms.roomForUser('user-1')!;

    jest.setSystemTime(5_000);
    for (let index = 3; index <= 16; index++) {
      await rooms.quickPlay(socket(index) as never, user(index));
    }
    await rooms.quickPlay(socket(17) as never, user(17));

    expect(firstRoom.players.size).toBe(16);
    expect(firstRoom.countdownEndsAt).toBe(15_000);
    expect(rooms.roomForUser('user-17')!.id).not.toBe(firstRoom.id);
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
    const { rooms, gameLoop, server, roomEmit } = createHarness(false);
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

    await rooms.finish(room.id, 'user-1');

    expect(roomEmit).toHaveBeenCalledWith(
      SOCKET_EVENTS.GAME.ENDED,
      expect.objectContaining({
        roomId: room.id,
        winnerUserId: 'user-1',
        returnToLobbyInMs: ROUND_RESET_MS,
      }),
    );

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

  it('quick play ignores private rooms and prefers fuller public rooms', async () => {
    jest.useFakeTimers();
    const { rooms } = createHarness(false);

    await rooms.createPrivate(socket(1) as never, user(1), 'Older Private', 'secret');
    await rooms.quickPlay(socket(2) as never, user(2));
    await rooms.quickPlay(socket(3) as never, user(3));

    await rooms.quickPlay(socket(4) as never, user(4));

    expect(rooms.roomForUser('user-4')!.id).toBe(rooms.roomForUser('user-2')!.id);
    expect(rooms.roomForUser('user-4')!.id).not.toBe(rooms.roomForUser('user-1')!.id);
    expect(rooms.listLobby()).toHaveLength(1);
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('normalizes private room names for unique lookup and checks the password', async () => {
    jest.useFakeTimers();
    const { rooms } = createHarness(false);

    const created = await rooms.createPrivate(socket(1) as never, user(1), 'LÓS   Tanques', 'secret');
    const joined = await rooms.joinPrivate('los tanques', 'secret', socket(2) as never, user(2));

    expect(created.type).toBe('private');
    expect(created.adminUserId).toBe('user-1');
    expect(created.rewardsEligible).toBe(false);
    expect(joined.id).toBe(created.id);
    await expect(rooms.createPrivate(socket(3) as never, user(3), 'Los Tanques', 'other'))
      .rejects.toMatchObject({ code: 'ROOM_NAME_TAKEN' });
    await expect(rooms.joinPrivate('Los Tanques', 'wrong', socket(4) as never, user(4)))
      .rejects.toMatchObject({ code: 'ROOM_NOT_FOUND_OR_INVALID_PASSWORD' });
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('allows only the private room admin to start and transfers admin on leave', async () => {
    jest.useFakeTimers();
    const { rooms, gameLoop } = createHarness(false);
    await rooms.createPrivate(socket(1) as never, user(1), 'Admin Arena', 'secret');
    await rooms.joinPrivate('admin arena', 'secret', socket(2) as never, user(2));

    expect(() => rooms.startNow('user-2')).toThrow(expect.objectContaining({ code: 'ROOM_START_FORBIDDEN' }));
    await rooms.leave('user-1');
    expect(rooms.roomForUser('user-2')?.adminUserId).toBe('user-2');

    await rooms.joinPrivate('admin arena', 'secret', socket(3) as never, user(3));
    const state = rooms.startNow('user-2');
    expect(state.status).toBe('countdown');
    expect(state.countdownSeconds).toBe(PRIVATE_ROOM_COUNTDOWN_SECONDS);
    expect(state.expiresAt).toBeNull();
    jest.advanceTimersByTime(PRIVATE_ROOM_COUNTDOWN_SECONDS * 1000);
    expect(rooms.stateForUser('user-2')?.status).toBe('in_game');
    expect(gameLoop.prepare).toHaveBeenCalledWith(state.id, expect.any(Array), {
      roomName: 'Admin Arena',
      roomType: 'private',
      rewardsEligible: false,
    });
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('warns before closing an inactive private room', async () => {
    jest.useFakeTimers().setSystemTime(1_000);
    const { rooms, roomEmit, server } = createHarness(false);
    const playerSocket = {
      id: 'socket-1',
      data: {},
      join: jest.fn(),
      leave: jest.fn(),
      emit: jest.fn(),
    };
    server.sockets.sockets.set(playerSocket.id, playerSocket);
    const state = await rooms.createPrivate(playerSocket as never, user(1), 'Temporary Arena', 'secret');

    expect(state.expiresAt).toBe(1_000 + PRIVATE_ROOM_INACTIVITY_MS);
    jest.advanceTimersByTime(PRIVATE_ROOM_INACTIVITY_MS - PRIVATE_ROOM_CLOSING_WARNING_MS);
    expect(roomEmit).toHaveBeenCalledWith(SOCKET_EVENTS.ROOM.CLOSING, expect.objectContaining({
      roomId: state.id,
      remainingSeconds: PRIVATE_ROOM_CLOSING_WARNING_MS / 1000,
    }));

    jest.advanceTimersByTime(PRIVATE_ROOM_CLOSING_WARNING_MS);
    expect(rooms.roomForUser('user-1')).toBeUndefined();
    expect(playerSocket.leave).toHaveBeenCalledWith(`game:${state.id}:players`);
    expect(playerSocket.emit).toHaveBeenCalledWith(SOCKET_EVENTS.ROOM.CLOSED, {
      roomId: state.id,
      reason: 'inactivity',
    });
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('returns stable validation metadata for private room names and passwords', async () => {
    const { rooms } = createHarness(false);

    await expect(rooms.createPrivate(socket(1) as never, user(1), 'ab', 'secret'))
      .rejects.toMatchObject({
        code: 'ROOM_NAME_INVALID',
        messageKey: 'lobby.errors.roomNameInvalid',
        messageParams: { minLength: 3, maxLength: 40 },
      });
    await expect(rooms.createPrivate(socket(1) as never, user(1), 'Valid Room', 'abc'))
      .rejects.toMatchObject({
        code: 'ROOM_PASSWORD_INVALID',
        messageKey: 'lobby.errors.roomPasswordInvalid',
        messageParams: { minLength: 4, maxLength: 32 },
      });
    await expect(rooms.createPrivate(socket(1) as never, user(1), '---', 'secret'))
      .rejects.toMatchObject({
        code: 'ROOM_NAME_INVALID',
        messageKey: 'lobby.errors.roomNameInvalid',
      });
  });

  it('enforces membership rules and reconnects an existing private-room member', async () => {
    jest.useFakeTimers();
    const { rooms } = createHarness(false);
    await rooms.createPrivate(socket(1) as never, user(1), 'Membership Room', 'secret');

    await expect(rooms.createPrivate(socket(1) as never, user(1), 'Another Room', 'secret'))
      .rejects.toMatchObject({ code: 'ROOM_ALREADY_JOINED' });
    await rooms.quickPlay(socket(2) as never, user(2));
    await expect(rooms.joinPrivate('Membership Room', 'secret', socket(2) as never, user(2)))
      .rejects.toMatchObject({ code: 'ROOM_ALREADY_JOINED' });

    const reconnectSocket = {
      id: 'socket-1-reconnected',
      data: {},
      join: jest.fn(),
      emit: jest.fn(),
    };
    const reconnected = await rooms.joinPrivate(
      'membership-room',
      'password-is-not-required-for-an-existing-member',
      reconnectSocket as never,
      user(1),
    );
    expect(reconnected.id).toBe(rooms.roomForUser('user-1')?.id);
    expect(reconnectSocket.join).toHaveBeenCalledWith(`game:${reconnected.id}:players`);
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('requires the production minimum before a private admin can start', async () => {
    jest.useFakeTimers();
    const { rooms } = createHarness(false);
    await rooms.createPrivate(socket(1) as never, user(1), 'Minimum Room', 'secret');

    expect(() => rooms.startNow('user-1')).toThrow(expect.objectContaining({
      code: 'ROOM_MIN_PLAYERS',
      messageKey: 'lobby.errors.roomMinPlayers',
      messageParams: { minPlayers: 2 },
    }));
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('rejects simultaneous duplicate-name and duplicate-user creation requests', async () => {
    jest.useFakeTimers();
    const { rooms } = createHarness(false);
    let resolveHash!: (value: string) => void;
    const pendingHash = new Promise<string>(resolve => { resolveHash = resolve; });
    jest.spyOn(
      rooms as unknown as { hashPassword(password: string, salt: string): Promise<string> },
      'hashPassword',
    ).mockReturnValueOnce(pendingHash);

    const firstCreation = rooms.createPrivate(socket(1) as never, user(1), 'Concurrent Room', 'secret');

    await expect(rooms.createPrivate(socket(2) as never, user(2), 'concurrent-room', 'secret'))
      .rejects.toMatchObject({ code: 'ROOM_NAME_TAKEN' });
    await expect(rooms.createPrivate(socket(1) as never, user(1), 'Different Room', 'secret'))
      .rejects.toMatchObject({ code: 'ROOM_CREATE_IN_PROGRESS' });

    resolveHash('00'.repeat(64));
    await firstCreation;
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('rolls back the room and normalized-name reservation when joining after creation fails', async () => {
    jest.useFakeTimers();
    const { redis, rooms } = createHarness(false);
    redis.set.mockRejectedValueOnce(new Error('Redis unavailable'));

    await expect(rooms.createPrivate(socket(1) as never, user(1), 'Rollback Room', 'secret'))
      .rejects.toThrow('Redis unavailable');

    expect(rooms.list()).toHaveLength(0);
    expect(rooms.roomForUser('user-1')).toBeUndefined();
    redis.set.mockResolvedValue(undefined);
    await expect(rooms.createPrivate(socket(1) as never, user(1), 'Rollback Room', 'secret'))
      .resolves.toMatchObject({ name: 'Rollback Room', type: 'private' });
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('rejects joins to full and already-started private rooms with specific codes', async () => {
    jest.useFakeTimers();
    const { rooms } = createHarness(false);
    await rooms.createPrivate(socket(1) as never, user(1), 'Full Room', 'secret');
    const fullRoom = rooms.roomForUser('user-1')!;
    for (let index = 2; index <= MAX_PLAYERS; index++) {
      fullRoom.players.set(`filled-${index}`, {
        userId: `filled-${index}`,
        username: `Filled${index}`,
        socketId: null,
        roundsPlayed: 0,
        roundWins: 0,
        kills: 0,
        damageDealt: 0,
      });
    }
    await expect(rooms.joinPrivate('Full Room', 'secret', socket(17) as never, user(17)))
      .rejects.toMatchObject({ code: 'ROOM_FULL' });

    await rooms.createPrivate(socket(20) as never, user(20), 'Started Room', 'secret');
    await rooms.joinPrivate('Started Room', 'secret', socket(21) as never, user(21));
    rooms.startNow('user-20');
    await expect(rooms.joinPrivate('Started Room', 'secret', socket(22) as never, user(22)))
      .rejects.toMatchObject({ code: 'ROOM_ALREADY_STARTED' });
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('does not close a private room after its game starts and clears lifecycle timers on shutdown', async () => {
    jest.useFakeTimers().setSystemTime(1_000);
    const { rooms, server } = createHarness(false);
    const firstSocket = {
      ...socket(1),
      leave: jest.fn(),
      emit: jest.fn(),
    };
    const secondSocket = {
      ...socket(2),
      leave: jest.fn(),
      emit: jest.fn(),
    };
    server.sockets.sockets.set(firstSocket.id, firstSocket);
    server.sockets.sockets.set(secondSocket.id, secondSocket);
    const state = await rooms.createPrivate(firstSocket as never, user(1), 'Persistent Room', 'secret');
    await rooms.joinPrivate('Persistent Room', 'secret', secondSocket as never, user(2));

    rooms.startNow('user-1');
    jest.advanceTimersByTime(120_000);

    expect(rooms.roomForUser('user-1')?.id).toBe(state.id);
    expect(firstSocket.emit).not.toHaveBeenCalledWith(SOCKET_EVENTS.ROOM.CLOSED, expect.anything());
    await rooms.createPrivate(socket(3) as never, user(3), 'Shutdown Room', 'secret');
    expect(jest.getTimerCount()).toBe(2);
    rooms.onModuleDestroy();
    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
  });

  it('keeps private members after a finished round and allows a second countdown', async () => {
    jest.useFakeTimers().setSystemTime(1_000);
    const { gameLoop, rooms, server } = createHarness(false);
    const playerSockets = [1, 2].map(index => ({
      ...socket(index),
      leave: jest.fn(),
      emit: jest.fn(),
    }));
    for (const playerSocket of playerSockets) server.sockets.sockets.set(playerSocket.id, playerSocket);
    const created = await rooms.createPrivate(playerSockets[0] as never, user(1), 'Rematch Room', 'secret');
    await rooms.joinPrivate('Rematch Room', 'secret', playerSockets[1] as never, user(2));
    rooms.startNow('user-1');
    jest.advanceTimersByTime(PRIVATE_ROOM_COUNTDOWN_SECONDS * 1000);
    gameLoop.buildState.mockReturnValue({ players: [{ id: 'user-1', alive: true }] });
    gameLoop.roundStats.mockReturnValue({
      'user-1': { kills: 2, deaths: 0, damageDealt: 400, damageTaken: 50 },
      'user-2': { kills: 0, deaths: 1, damageDealt: 120, damageTaken: 400 },
    });

    await rooms.finish(created.id, 'user-1');
    jest.advanceTimersByTime(ROUND_RESET_MS);

    const waiting = rooms.stateForUser('user-1');
    expect(waiting).toMatchObject({
      id: created.id,
      type: 'private',
      status: 'waiting',
      playerCount: 2,
      rewardsEligible: false,
    });
    expect(waiting?.expiresAt).not.toBeNull();
    expect(waiting?.players).toEqual(expect.arrayContaining([
      expect.objectContaining({
        userId: 'user-1',
        roundsPlayed: 1,
        roundWins: 1,
        kills: 2,
        damageDealt: 400,
      }),
      expect.objectContaining({
        userId: 'user-2',
        roundsPlayed: 1,
        roundWins: 0,
      }),
    ]));
    expect(gameLoop.remove).toHaveBeenCalledWith(created.id);
    for (const playerSocket of playerSockets) {
      expect(playerSocket.emit).not.toHaveBeenCalledWith(SOCKET_EVENTS.ROOM.LEFT, expect.anything());
    }

    const secondRound = rooms.startNow('user-1');
    expect(secondRound.status).toBe('countdown');
    expect(secondRound.countdownSeconds).toBe(PRIVATE_ROOM_COUNTDOWN_SECONDS);
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('keeps disconnected private members visible during grace and removes them after timeout', async () => {
    jest.useFakeTimers();
    const { rooms } = createHarness(false);
    await rooms.createPrivate(socket(1) as never, user(1), 'Presence Room', 'secret');
    await rooms.joinPrivate('Presence Room', 'secret', socket(2) as never, user(2));

    await rooms.disconnect('user-2', 'socket-2');

    expect(rooms.stateForUser('user-1')?.players.find(player => player.userId === 'user-2'))
      .toMatchObject({ connected: false });
    jest.advanceTimersByTime(RECONNECT_GRACE_MS - 1);
    expect(rooms.roomForUser('user-2')).toBeDefined();
    jest.advanceTimersByTime(1);
    await Promise.resolve();
    expect(rooms.roomForUser('user-2')).toBeUndefined();
    expect(rooms.stateForUser('user-1')?.playerCount).toBe(1);
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
