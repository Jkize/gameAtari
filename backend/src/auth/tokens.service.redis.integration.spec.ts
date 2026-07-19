import { AuthProvider, UserRole } from '@prisma/client';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { REDIS_KEY_PREFIX } from '../redis/redis.service';
import { TokensService } from './tokens.service';

const redisUrl = process.env.TEST_REDIS_URL;
const describeWithRedis = redisUrl ? describe : describe.skip;

describeWithRedis('TokensService real Redis integration', () => {
  let client: Redis;
  let rawClient: Redis;
  let sessionId: string;
  let service: TokensService;

  beforeAll(async () => {
    client = new Redis(redisUrl!, { keyPrefix: REDIS_KEY_PREFIX });
    rawClient = new Redis(redisUrl!);
    await Promise.all([client.ping(), rawClient.ping()]);
  });

  beforeEach(() => {
    sessionId = `integration-${randomUUID()}`;
    const jwt = {
      signAsync: jest.fn().mockResolvedValue('access-token'),
      verifyAsync: jest.fn(),
    };
    const config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === 'AUTH_REFRESH_TTL_SECONDS') return 60;
        if (key === 'JWT_ACCESS_TTL') return '15m';
        return fallback;
      }),
      getOrThrow: jest.fn((key: string) => `${key}-value`),
    };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: '00000000-0000-4000-8000-000000000001',
          username: 'RedisTester',
          role: UserRole.USER,
          active: true,
        }),
      },
    };
    service = new TokensService(jwt as never, config as never, prisma as never, { client } as never);
  });

  afterEach(async () => {
    await rawClient.del(`${REDIS_KEY_PREFIX}auth:session:${sessionId}`);
  });

  afterAll(async () => {
    await Promise.all([client.quit(), rawClient.quit()]);
  });

  it('prefixes the key, applies its TTL, and atomically detects concurrent reuse', async () => {
    const issued = await service.issueSession(
      {
        id: '00000000-0000-4000-8000-000000000001',
        username: 'RedisTester',
        role: UserRole.USER,
      },
      AuthProvider.GOOGLE,
      sessionId,
    );
    const physicalKey = `${REDIS_KEY_PREFIX}auth:session:${sessionId}`;

    expect(await rawClient.exists(physicalKey)).toBe(1);
    expect(await rawClient.ttl(physicalKey)).toBeGreaterThan(0);
    expect((await rawClient.keys(`${REDIS_KEY_PREFIX}auth:session:integration-*`)))
      .toContain(physicalKey);

    const attempts = await Promise.allSettled([
      service.rotate(issued.refreshCookie.value),
      service.rotate(issued.refreshCookie.value),
    ]);

    expect(attempts.filter(attempt => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter(attempt => attempt.status === 'rejected')).toHaveLength(1);
    expect(await rawClient.exists(physicalKey)).toBe(0);
  });
});
