const socketMocks = vi.hoisted(() => {
  const handlers = new Map<string, (error: unknown) => void>();
  const socket: Record<string, unknown> = {
    active: false,
    connected: false,
    auth: undefined,
  };
  socket['on'] = vi.fn((event: string, handler: (error: unknown) => void) => {
    handlers.set(event, handler);
    return socket;
  });
  socket['off'] = vi.fn(() => socket);
  socket['connect'] = vi.fn(() => socket);
  socket['disconnect'] = vi.fn(() => socket);
  return {
    handlers,
    io: vi.fn((_url: string, options: { auth?: unknown }) => {
      socket['auth'] = options.auth;
      return socket;
    }),
    socket,
  };
});

vi.mock('socket.io-client', () => ({ io: socketMocks.io }));

import { SocketManager } from './socket';
import { SOCKET_CONNECTION_ERROR_CODES } from './socket-events';

describe('SocketManager authentication recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    socketMocks.handlers.clear();
    socketMocks.socket['active'] = false;
    socketMocks.socket['connected'] = false;
    socketMocks.socket['auth'] = undefined;
  });

  it('uses the latest token for every handshake without erasing the previous token', () => {
    let currentToken: string | undefined;
    const manager = new SocketManager();
    manager.configureAuthentication({
      accessToken: () => currentToken,
      refreshAccessToken: vi.fn(),
    });
    manager.connect('initial-token');

    let payload: { token?: string } | undefined;
    (socketMocks.socket['auth'] as (callback: (value: { token?: string }) => void) => void)(value => {
      payload = value;
    });
    expect(payload?.token).toBe('initial-token');

    manager.connect();
    currentToken = 'refreshed-token';
    (socketMocks.socket['auth'] as (callback: (value: { token?: string }) => void) => void)(value => {
      payload = value;
    });
    expect(payload?.token).toBe('refreshed-token');
  });

  it('refreshes once and reconnects after simultaneous authentication errors', async () => {
    let resolveRefresh!: (token: string | null) => void;
    const refreshAccessToken = vi.fn(() => new Promise<string | null>(resolve => {
      resolveRefresh = resolve;
    }));
    const manager = new SocketManager();
    manager.configureAuthentication({
      accessToken: () => 'expired-token',
      refreshAccessToken,
    });
    manager.connect();
    const connectError = socketMocks.handlers.get('connect_error')!;

    connectError({ data: { code: SOCKET_CONNECTION_ERROR_CODES.ACCESS_TOKEN_EXPIRED } });
    connectError({ data: { code: SOCKET_CONNECTION_ERROR_CODES.ACCESS_TOKEN_EXPIRED } });
    await vi.waitFor(() => expect(refreshAccessToken).toHaveBeenCalledTimes(1));

    resolveRefresh('new-token');
    await vi.waitFor(() => expect(socketMocks.socket['connect']).toHaveBeenCalledTimes(1));
  });

  it('does not refresh for connection errors unrelated to authentication', async () => {
    const refreshAccessToken = vi.fn();
    const manager = new SocketManager();
    manager.configureAuthentication({
      accessToken: () => 'token',
      refreshAccessToken,
    });
    manager.connect();

    socketMocks.handlers.get('connect_error')?.({
      data: { code: SOCKET_CONNECTION_ERROR_CODES.RATE_LIMITED },
    });
    await Promise.resolve();

    expect(refreshAccessToken).not.toHaveBeenCalled();
  });
});
