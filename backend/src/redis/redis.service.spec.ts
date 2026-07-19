import Redis from 'ioredis';
import { REDIS_KEY_PREFIX, RedisService } from './redis.service';

jest.mock('ioredis');

describe('RedisService', () => {
  const client = {
    status: 'wait',
    on: jest.fn(),
    connect: jest.fn(),
    ping: jest.fn(),
    disconnect: jest.fn(),
    quit: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };
  const RedisConstructor = Redis as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    client.status = 'wait';
    client.connect.mockResolvedValue(undefined);
    client.ping.mockResolvedValue('PONG');
    client.quit.mockResolvedValue('OK');
    RedisConstructor.mockImplementation(() => client);
  });

  it('requires the configured external URL and applies the tkgame namespace', () => {
    const config = { getOrThrow: jest.fn(() => 'redis://shared.example.com:6379/0') };

    new RedisService(config as never);

    expect(config.getOrThrow).toHaveBeenCalledWith('REDIS_URL');
    expect(RedisConstructor).toHaveBeenCalledWith(
      'redis://shared.example.com:6379/0',
      expect.objectContaining({
        keyPrefix: REDIS_KEY_PREFIX,
        lazyConnect: true,
        maxRetriesPerRequest: 2,
      }),
    );
    expect(REDIS_KEY_PREFIX).toBe('tkgame:');
  });

  it('connects and verifies Redis before the backend starts', async () => {
    const service = new RedisService({ getOrThrow: () => 'redis://shared.example.com:6379/0' } as never);

    await service.ensureConnected();

    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.ping).toHaveBeenCalledTimes(1);
  });

  it('fails startup instead of falling back to memory', async () => {
    client.ping.mockRejectedValue(new Error('unavailable'));
    const service = new RedisService({ getOrThrow: () => 'redis://shared.example.com:6379/0' } as never);

    await expect(service.ensureConnected()).rejects.toThrow('Redis connection failed');

    expect(client.disconnect).toHaveBeenCalledTimes(1);
  });
});
