import { SOCKET_EVENTS } from '../../../common/socket-events';
import { WatcherPresenceService } from './watcher-presence.service';

describe('WatcherPresenceService', () => {
  it('moves a watcher between rooms and broadcasts both updated counts', async () => {
    const rooms = new Map<string, Set<string>>([
      ['game:old:watchers', new Set(['socket-1'])],
      ['game:new:watchers', new Set()],
    ]);
    const emit = jest.fn();
    const audience = { to: jest.fn(() => ({ emit })), emit };
    const server = {
      sockets: { adapter: { rooms }, sockets: new Map() },
      to: jest.fn(() => audience),
    };
    const socket = {
      id: 'socket-1',
      data: { watchingRoomId: 'old' },
      leave: jest.fn(async (room: string) => rooms.get(room)?.delete('socket-1')),
      join: jest.fn(async (room: string) => {
        rooms.get(room)?.add('socket-1');
      }),
    };
    const service = new WatcherPresenceService({ get: jest.fn() } as never);
    service.setServer(server as never);

    await service.join(socket as never, 'new');

    expect(socket.leave).toHaveBeenCalledWith('game:old:watchers');
    expect(socket.join).toHaveBeenCalledWith('game:new:watchers');
    expect(socket.data.watchingRoomId).toBe('new');
    expect(emit).toHaveBeenCalledWith(SOCKET_EVENTS.GAME.VIEWER_COUNT_CHANGED, {
      roomId: 'old', count: 0,
    });
    expect(emit).toHaveBeenCalledWith(SOCKET_EVENTS.GAME.VIEWER_COUNT_CHANGED, {
      roomId: 'new', count: 1,
    });
  });

  it('removes watcher presence when the same socket becomes a player', async () => {
    const rooms = new Map<string, Set<string>>([
      ['game:room-1:watchers', new Set(['socket-1'])],
    ]);
    const emit = jest.fn();
    const server = {
      sockets: { adapter: { rooms }, sockets: new Map() },
      to: jest.fn(() => ({ to: jest.fn(() => ({ emit })) })),
    };
    const socket = {
      id: 'socket-1',
      data: { watchingRoomId: 'room-1' },
      leave: jest.fn(async (room: string) => rooms.get(room)?.delete('socket-1')),
    };
    const service = new WatcherPresenceService({ get: jest.fn() } as never);
    service.setServer(server as never);

    service.stopWatching(socket as never);
    await Promise.resolve();
    await Promise.resolve();

    expect(socket.data.watchingRoomId).toBeUndefined();
    expect(socket.leave).toHaveBeenCalledWith('game:room-1:watchers');
    expect(emit).toHaveBeenCalledWith(SOCKET_EVENTS.GAME.VIEWER_COUNT_CHANGED, {
      roomId: 'room-1', count: 0,
    });
  });

  it('counts connected eliminated players as spectators', () => {
    const rooms = new Map<string, Set<string>>([
      ['game:room-1:players', new Set(['alive-socket', 'dead-socket'])],
      ['game:room-1:watchers', new Set()],
    ]);
    const sockets = new Map([
      ['alive-socket', { data: { auth: { userId: 'alive-player' } } }],
      ['dead-socket', { data: { auth: { userId: 'dead-player' } } }],
    ]);
    const server = {
      sockets: { adapter: { rooms }, sockets },
      to: jest.fn(),
    };
    const sessions = {
      get: jest.fn(() => ({
        players: new Map([
          ['alive-player', { alive: true }],
          ['dead-player', { alive: false }],
        ]),
      })),
    };
    const service = new WatcherPresenceService(sessions as never);
    service.setServer(server as never);

    expect(service.count('room-1')).toBe(1);
  });

  it('does not count the same socket twice across player and watcher rooms', () => {
    const rooms = new Map<string, Set<string>>([
      ['game:room-1:players', new Set(['socket-1'])],
      ['game:room-1:watchers', new Set(['socket-1'])],
    ]);
    const server = {
      sockets: {
        adapter: { rooms },
        sockets: new Map([
          ['socket-1', { data: { auth: { userId: 'dead-player' } } }],
        ]),
      },
      to: jest.fn(),
    };
    const sessions = {
      get: jest.fn(() => ({
        players: new Map([['dead-player', { alive: false }]]),
      })),
    };
    const service = new WatcherPresenceService(sessions as never);
    service.setServer(server as never);

    expect(service.count('room-1')).toBe(1);
  });
});
