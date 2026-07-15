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
    status: 'countdown',
    playerCount: 6,
    minPlayers: 4,
    maxPlayers: 15,
    countdownSeconds: 12,
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

    handlers.get(SOCKET_EVENTS.GAME.STARTED)?.();
    expect(service.currentRoom()).toBeNull();
    expect(service.countdownRoom()).toBeNull();
  });

  it('does not attach global queue listeners in dev game mode', () => {
    environment.devGameMode = true;
    const onCreated = vi.spyOn(socketManager, 'onCreated');

    new QueueStatusService().start();

    expect(onCreated).not.toHaveBeenCalled();
  });
});
