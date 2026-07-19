import type { Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';
import { socketManager } from './socket';
import { SOCKET_EVENTS } from './socket-events';
import { QueueStatusService } from './queue-status.service';
import { RoomState } from './room-state';

describe('QueueStatusService', () => {
  const countdownRoom: RoomState = {
    id: 'room-1',
    name: 'Arena 1',
    type: 'public',
    adminUserId: null,
    rewardsEligible: true,
    status: 'countdown',
    playerCount: 6,
    minPlayers: 4,
    maxPlayers: 15,
    countdownSeconds: 12,
    expiresAt: null,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    environment.devGameMode = false;
  });

  afterEach(() => {
    environment.devGameMode = false;
  });

  it('tracks countdown updates and clears the room when the match starts', () => {
    const handlers = new Map<string, (...args: never[]) => void>();
    const socket = {
      connected: true,
      on: vi.fn((event: string, handler: (...args: never[]) => void) => {
        handlers.set(event, handler);
        return socket;
      }),
      emit: vi.fn(() => socket),
    };
    vi.spyOn(socketManager, 'onCreated').mockImplementation((callback: (created: Socket) => void) => {
      callback(socket as unknown as Socket);
    });

    const service = new QueueStatusService();
    service.start();
    service.start();

    expect(socketManager.onCreated).toHaveBeenCalledTimes(1);
    expect(socket.emit).toHaveBeenCalledWith(SOCKET_EVENTS.ROOM.GET_STATE);
    handlers.get(SOCKET_EVENTS.ROOM.COUNTDOWN_UPDATED)?.(countdownRoom as never);
    expect(service.countdownRoom()).toEqual(countdownRoom);
    expect(service.floatingRoom()).toEqual(countdownRoom);

    handlers.get(SOCKET_EVENTS.GAME.STARTED)?.();
    expect(service.currentRoom()).toBeNull();
    expect(service.countdownRoom()).toBeNull();
    expect(service.floatingRoom()).toBeNull();
  });

  it('keeps a waiting private room visible globally and lets its admin start it', () => {
    const handlers = new Map<string, (...args: never[]) => void>();
    const socket = {
      connected: true,
      on: vi.fn((event: string, handler: (...args: never[]) => void) => {
        handlers.set(event, handler);
        return socket;
      }),
      emit: vi.fn(() => socket),
    };
    vi.spyOn(socketManager, 'onCreated').mockImplementation((callback: (created: Socket) => void) => {
      callback(socket as unknown as Socket);
    });
    vi.spyOn(socketManager, 'get').mockReturnValue(socket as unknown as Socket);
    const service = new QueueStatusService();
    const privateRoom: RoomState = {
      ...countdownRoom,
      id: 'private-1',
      name: 'Squad Room',
      type: 'private',
      adminUserId: 'admin-1',
      rewardsEligible: false,
      status: 'waiting',
      minPlayers: 2,
      maxPlayers: 16,
      countdownSeconds: null,
      expiresAt: Date.now() + 240_000,
      players: [
        { userId: 'admin-1', username: 'Admin', connected: true },
        { userId: 'player-2', username: 'Player 2', connected: true },
      ],
    };
    service.start();

    handlers.get(SOCKET_EVENTS.ROOM.JOINED)?.(privateRoom as never);
    expect(service.floatingRoom()).toEqual(privateRoom);

    service.startPrivateRoom('admin-1');
    expect(socket.emit).toHaveBeenCalledWith(SOCKET_EVENTS.GAME.START);
    expect(service.startingPrivateRoom()).toBe(true);

    handlers.get(SOCKET_EVENTS.GAME.ERROR)?.({} as never);
    expect(service.startingPrivateRoom()).toBe(false);
    expect(service.startPrivateRoomFailed()).toBe(true);
  });

  it('clears private-room state when the backend closes it for inactivity', () => {
    const handlers = new Map<string, (...args: never[]) => void>();
    const socket = {
      connected: false,
      on: vi.fn((event: string, handler: (...args: never[]) => void) => {
        handlers.set(event, handler);
        return socket;
      }),
      emit: vi.fn(() => socket),
    };
    vi.spyOn(socketManager, 'onCreated').mockImplementation((callback: (created: Socket) => void) => {
      callback(socket as unknown as Socket);
    });
    const service = new QueueStatusService();
    service.start();

    handlers.get(SOCKET_EVENTS.ROOM.JOINED)?.(countdownRoom as never);
    expect(service.currentRoom()).toEqual(countdownRoom);
    handlers.get(SOCKET_EVENTS.ROOM.CLOSED)?.();
    expect(service.currentRoom()).toBeNull();
  });

  it('does not attach global queue listeners in dev game mode', () => {
    environment.devGameMode = true;
    const onCreated = vi.spyOn(socketManager, 'onCreated');

    new QueueStatusService().start();

    expect(onCreated).not.toHaveBeenCalled();
  });
});
