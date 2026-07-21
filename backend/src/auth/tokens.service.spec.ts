import { UnauthorizedException } from '@nestjs/common';
import { AuthProvider, UserRole } from '@prisma/client';
import { createHash } from 'crypto';
import { TokensService } from './tokens.service';

describe('TokensService Redis sessions', () => {
  const jwt = {
    signAsync: jest.fn(),
    verifyAsync: jest.fn(),
  };
  const config = {
    get: jest.fn((key: string, fallback?: unknown) => {
      if (key === 'AUTH_REFRESH_TTL_SECONDS') return 3600;
      if (key === 'JWT_ACCESS_TTL') return '15m';
      return fallback;
    }),
    getOrThrow: jest.fn((key: string) => `${key}-value`),
  };
  const prisma = {
    user: { findUnique: jest.fn(), update: jest.fn() },
  };
  const redisClient = {
    set: jest.fn(),
    eval: jest.fn(),
    exists: jest.fn(),
    del: jest.fn(),
  };
  const redis = { client: redisClient };

  let service: TokensService;

  beforeEach(() => {
    jest.clearAllMocks();
    jwt.signAsync.mockResolvedValue('access-token');
    redisClient.set.mockResolvedValue('OK');
    redisClient.del.mockResolvedValue(1);
    prisma.user.update.mockResolvedValue({});
    service = new TokensService(
      jwt as never,
      config as never,
      prisma as never,
      redis as never,
    );
  });

  it('stores only the minimal session metadata with a Redis TTL', async () => {
    const result = await service.issueSession(
      { id: 'user-1', username: 'TankOne', role: UserRole.USER },
      AuthProvider.GOOGLE,
      'session-1',
    );

    expect(redisClient.set).toHaveBeenCalledWith(
      'auth:session:session-1',
      expect.any(String),
      'EX',
      3600,
    );
    const stored = JSON.parse(redisClient.set.mock.calls[0][1] as string);
    expect(stored).toEqual({
      refreshHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      userId: 'user-1',
      provider: AuthProvider.GOOGLE,
    });
    expect(stored).not.toHaveProperty('username');
    expect(stored).not.toHaveProperty('role');
    expect(result.refreshCookie.value).toMatch(/^session-1\./);
    expect(result.refreshCookie.value).not.toContain(stored.refreshHash);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { lastConnectionAt: expect.any(Date) },
    });
  });

  it('rotates the refresh hash atomically and loads the current user', async () => {
    redisClient.eval.mockResolvedValue([1, 'user-1', AuthProvider.PHANTOM]);
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      username: 'CurrentName',
      role: UserRole.ADMIN,
      active: true,
      lastConnectionAt: new Date(),
    });

    const result = await service.rotate('session-1.previous-refresh');

    expect(redisClient.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('SET'"),
      1,
      'auth:session:session-1',
      createHash('sha256').update('previous-refresh').digest('hex'),
      expect.stringMatching(/^[a-f0-9]{64}$/),
      3600,
    );
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { id: true, username: true, role: true, active: true, lastConnectionAt: true },
    });
    expect(jwt.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: 'user-1',
        username: 'CurrentName',
        provider: AuthProvider.PHANTOM,
        role: UserRole.ADMIN,
        sid: 'session-1',
      }),
      expect.any(Object),
    );
    expect(result.refreshCookie.value).toMatch(/^session-1\./);
    expect(result.refreshCookie.value).not.toBe('session-1.previous-refresh');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('touches lastConnectionAt on rotate when it is null (never connected)', async () => {
    redisClient.eval.mockResolvedValue([1, 'user-1', AuthProvider.GOOGLE]);
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      username: 'TankOne',
      role: UserRole.USER,
      active: true,
      lastConnectionAt: null,
    });

    await service.rotate('session-1.refresh');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { lastConnectionAt: expect.any(Date) },
    });
  });

  it('touches lastConnectionAt on rotate when the stored value is stale', async () => {
    redisClient.eval.mockResolvedValue([1, 'user-1', AuthProvider.GOOGLE]);
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      username: 'TankOne',
      role: UserRole.USER,
      active: true,
      lastConnectionAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    });

    await service.rotate('session-1.refresh');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { lastConnectionAt: expect.any(Date) },
    });
  });

  it('does not touch lastConnectionAt on rotate when it was updated recently', async () => {
    redisClient.eval.mockResolvedValue([1, 'user-1', AuthProvider.GOOGLE]);
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      username: 'TankOne',
      role: UserRole.USER,
      active: true,
      lastConnectionAt: new Date(Date.now() - 5 * 60 * 1000),
    });

    await service.rotate('session-1.refresh');

    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it.each([0, -1])('rejects missing and reused sessions without querying PostgreSQL', async status => {
    redisClient.eval.mockResolvedValue([status]);

    await expect(service.rotate('session-1.refresh')).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('revokes a rotated session when its user is inactive', async () => {
    redisClient.eval.mockResolvedValue([1, 'user-1', AuthProvider.GOOGLE]);
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      username: 'TankOne',
      role: UserRole.USER,
      active: false,
    });

    await expect(service.rotate('session-1.refresh')).rejects.toBeInstanceOf(UnauthorizedException);

    expect(redisClient.del).toHaveBeenCalledWith('auth:session:session-1');
  });

  it('requires the Redis session to authenticate an access token', async () => {
    jwt.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      sid: 'session-1',
      username: 'TankOne',
      provider: AuthProvider.GOOGLE,
      role: UserRole.USER,
      type: 'access',
    });
    redisClient.exists.mockResolvedValue(0);

    await expect(service.authenticateAccess('jwt')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(redisClient.exists).toHaveBeenCalledWith('auth:session:session-1');
  });

  it('revokes a session only by deleting it from Redis', async () => {
    await service.revoke('session-1');

    expect(redisClient.del).toHaveBeenCalledWith('auth:session:session-1');
    expect(Object.keys(prisma)).toEqual(['user']);
  });

  it('fails closed when Redis rotation fails', async () => {
    redisClient.eval.mockRejectedValue(new Error('Redis unavailable'));

    await expect(service.rotate('session-1.refresh')).rejects.toThrow('Redis unavailable');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
