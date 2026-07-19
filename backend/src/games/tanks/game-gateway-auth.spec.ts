jest.mock('@solana/web3.js', () => ({
  PublicKey: class PublicKey {
    constructor(readonly value: string) {}
  },
}));

import { SOCKET_CONNECTION_ERROR_CODES } from '../../common/socket-events';
import { GameGateway } from './game.gateway';

describe('GameGateway connection authentication errors', () => {
  const createHarness = () => {
    let middleware!: (socket: any, next: (error?: Error) => void) => Promise<void>;
    const tokens = { authenticateAccess: jest.fn() };
    const rooms = { setServer: jest.fn() };
    const gameLoop = { setServer: jest.fn(), onFinished: jest.fn() };
    const developmentSettings = { isDevGameMode: jest.fn(() => false) };
    const rateLimiter = { isConnectionAllowed: jest.fn(() => true) };
    const eventPublisher = { setServer: jest.fn() };
    const watcherPresence = { setServer: jest.fn() };
    const gateway = new GameGateway(
      tokens as never,
      rooms as never,
      gameLoop as never,
      {} as never,
      developmentSettings as never,
      rateLimiter as never,
      eventPublisher as never,
      watcherPresence as never,
      { latest: jest.fn(), recent: jest.fn() } as never,
    );
    const server = {
      use: jest.fn((handler: typeof middleware) => {
        middleware = handler;
      }),
    };
    gateway.afterInit(server as never);
    const socket = {
      id: 'socket-1',
      data: {},
      handshake: {
        address: '127.0.0.1',
        auth: { token: 'access-token' },
        headers: {},
      },
    };
    return { middleware, rateLimiter, socket, tokens };
  };

  it('reports an expired access token with a stable connection error code', async () => {
    const { middleware, socket, tokens } = createHarness();
    const expired = new Error('jwt expired');
    expired.name = 'TokenExpiredError';
    tokens.authenticateAccess.mockRejectedValue(expired);
    const next = jest.fn();

    await middleware(socket, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Access token expired',
      data: { code: SOCKET_CONNECTION_ERROR_CODES.ACCESS_TOKEN_EXPIRED },
    }));
  });

  it('does not label connection rate limiting as an authentication failure', async () => {
    const { middleware, rateLimiter, socket, tokens } = createHarness();
    rateLimiter.isConnectionAllowed.mockReturnValue(false);
    const next = jest.fn();

    await middleware(socket, next);

    expect(tokens.authenticateAccess).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      data: { code: SOCKET_CONNECTION_ERROR_CODES.RATE_LIMITED },
    }));
  });
});
