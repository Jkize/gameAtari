jest.mock('@solana/web3.js', () => ({
  PublicKey: class PublicKey {
    constructor(readonly value: string) {}
  },
}));

import { AuthProvider } from '@prisma/client';
import { SOCKET_EVENTS } from '../../common/socket-events';
import { RoomRequestError } from '../../rooms/room.errors';
import { GameGateway } from './game.gateway';

describe('GameGateway private room contract', () => {
  const roomState = {
    id: 'private-room-1',
    name: 'Test Room',
    type: 'private' as const,
    adminUserId: 'user-1',
    rewardsEligible: false,
    status: 'waiting' as const,
    playerCount: 1,
    minPlayers: 2,
    maxPlayers: 16,
    countdownSeconds: null,
    expiresAt: Date.now() + 120_000,
    players: [{ userId: 'user-1', username: 'Pilot1', connected: true, alive: true }],
  };

  const createHarness = () => {
    const rooms = {
      createPrivate: jest.fn(async () => roomState),
      joinPrivate: jest.fn(async () => roomState),
      roomForUser: jest.fn(),
      startNow: jest.fn(() => roomState),
    };
    const developmentSettings = {
      isDevGameMode: jest.fn(() => false),
      isManualStartEnabled: jest.fn(() => false),
    };
    const rateLimiter = {
      checkLobbyAction: jest.fn(() => true),
    };
    const gateway = new GameGateway(
      {} as never,
      rooms as never,
      {} as never,
      {} as never,
      developmentSettings as never,
      rateLimiter as never,
      {} as never,
      {} as never,
      { latest: jest.fn(), recent: jest.fn() } as never,
    );
    const client = {
      id: 'socket-1',
      data: {
        auth: {
          userId: 'user-1',
          sessionId: 'session-1',
          username: 'Pilot1',
          provider: AuthProvider.GOOGLE,
        },
      },
      emit: jest.fn(),
    };
    return { client, developmentSettings, gateway, rateLimiter, rooms };
  };

  it('creates a private room and emits the joined state', async () => {
    const { client, gateway, rooms } = createHarness();

    await gateway.createRoom(client as never, { name: 'Test Room', password: 'secret' });

    expect(rooms.createPrivate).toHaveBeenCalledWith(
      client,
      client.data.auth,
      'Test Room',
      'secret',
    );
    expect(client.emit).toHaveBeenCalledWith(SOCKET_EVENTS.ROOM.JOINED, roomState);
  });

  it('joins a private room by normalized name credentials and emits its state', async () => {
    const { client, gateway, rooms } = createHarness();

    await gateway.joinRoom(client as never, { name: 'test room', password: 'secret' });

    expect(rooms.joinPrivate).toHaveBeenCalledWith(
      'test room',
      'secret',
      client,
      client.data.auth,
    );
    expect(client.emit).toHaveBeenCalledWith(SOCKET_EVENTS.ROOM.JOINED, roomState);
  });

  it('rejects an invalid create payload with a localizable and loggable error', async () => {
    const { client, gateway, rooms } = createHarness();

    await gateway.createRoom(client as never, { name: 'Missing password' });

    expect(rooms.createPrivate).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith(SOCKET_EVENTS.GAME.ERROR, {
      code: 'ROOM_CREATE_INVALID',
      messageKey: 'lobby.errors.roomCreateInvalid',
      messageParams: {},
      message: 'Room name and password are required',
    });
  });

  it('rejects an invalid join payload with its distinct stable error code', async () => {
    const { client, gateway, rooms } = createHarness();

    await gateway.joinRoom(client as never, { password: 'secret' });

    expect(rooms.joinPrivate).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith(SOCKET_EVENTS.GAME.ERROR, {
      code: 'ROOM_JOIN_INVALID',
      messageKey: 'lobby.errors.roomJoinInvalid',
      messageParams: {},
      message: 'Room name and password are required',
    });
  });

  it('forwards room error keys, params, and technical messages unchanged', async () => {
    const { client, gateway, rooms } = createHarness();
    rooms.joinPrivate.mockRejectedValue(new RoomRequestError(
      'ROOM_MIN_PLAYERS',
      'At least 2 players are required to start',
      { minPlayers: 2 },
    ));

    await gateway.joinRoom(client as never, { name: 'Test Room', password: 'secret' });

    expect(client.emit).toHaveBeenCalledWith(SOCKET_EVENTS.GAME.ERROR, {
      code: 'ROOM_MIN_PLAYERS',
      messageKey: 'lobby.errors.roomMinPlayers',
      messageParams: { minPlayers: 2 },
      message: 'At least 2 players are required to start',
    });
  });

  it('uses a stable fallback contract for unexpected room failures', async () => {
    const { client, gateway, rooms } = createHarness();
    rooms.createPrivate.mockRejectedValue(new Error('Redis unavailable'));

    await gateway.createRoom(client as never, { name: 'Test Room', password: 'secret' });

    expect(client.emit).toHaveBeenCalledWith(SOCKET_EVENTS.GAME.ERROR, {
      code: 'REQUEST_FAILED',
      messageKey: 'common.errors.requestFailed',
      messageParams: {},
      message: 'Redis unavailable',
    });
  });

  it('returns the complete localized rate-limit payload without calling the room service', async () => {
    const { client, gateway, rateLimiter, rooms } = createHarness();
    rateLimiter.checkLobbyAction.mockReturnValue(false);

    await gateway.joinRoom(client as never, { name: 'Test Room', password: 'secret' });

    expect(rooms.joinPrivate).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith(SOCKET_EVENTS.GAME.ERROR, {
      code: 'RATE_LIMITED',
      messageKey: 'common.errors.rateLimited',
      messageParams: {},
      message: 'Too many requests, slow down',
    });
  });

  it('allows private admins through manual start and serializes start errors', () => {
    const { client, gateway, rooms } = createHarness();
    rooms.roomForUser.mockReturnValue({ type: 'private' });
    rooms.startNow.mockImplementation(() => {
      throw new RoomRequestError(
        'ROOM_MIN_PLAYERS',
        'At least 2 players are required to start',
        { minPlayers: 2 },
      );
    });

    gateway.startGame(client as never);

    expect(rooms.startNow).toHaveBeenCalledWith('user-1');
    expect(client.emit).toHaveBeenCalledWith(SOCKET_EVENTS.GAME.ERROR, {
      code: 'ROOM_MIN_PLAYERS',
      messageKey: 'lobby.errors.roomMinPlayers',
      messageParams: { minPlayers: 2 },
      message: 'At least 2 players are required to start',
    });
  });

  it('starts a private room without requiring the development manual-start flag', () => {
    const { client, developmentSettings, gateway, rooms } = createHarness();
    rooms.roomForUser.mockReturnValue({ type: 'private' });

    gateway.startGame(client as never);

    expect(developmentSettings.isManualStartEnabled).not.toHaveBeenCalled();
    expect(rooms.startNow).toHaveBeenCalledWith('user-1');
    expect(client.emit).not.toHaveBeenCalledWith(SOCKET_EVENTS.GAME.ERROR, expect.anything());
  });

  it('keeps authoritative countdown behavior for public rooms', () => {
    const { client, gateway, rooms } = createHarness();
    rooms.roomForUser.mockReturnValue({ type: 'public' });

    gateway.startGame(client as never);

    expect(rooms.startNow).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith(SOCKET_EVENTS.GAME.ERROR, {
      code: 'COUNTDOWN_AUTHORITATIVE',
      messageKey: 'game.errors.countdownAuthoritative',
      messageParams: {},
      message: 'The room countdown starts the game automatically',
    });
  });
});
