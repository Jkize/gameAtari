import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import RedisMock from 'ioredis-mock';

@Injectable()
export class RedisService implements OnModuleDestroy {
  client: Redis;
  private usingMemoryFallback = false;

  constructor(config: ConfigService) {
    const redisUrl = config.get<string>('REDIS_URL');
    this.client = redisUrl
      ? new Redis(redisUrl, {
          lazyConnect: true,
          maxRetriesPerRequest: 2,
        })
      : this.createMemoryClient('REDIS_URL is not configured');
  }

  async ensureConnected(): Promise<void> {
    if (this.usingMemoryFallback) return;
    try {
      if (this.client.status === 'wait') await this.client.connect();
    } catch (error) {
      this.client.disconnect();
      this.client = this.createMemoryClient(error instanceof Error ? error.message : 'Redis connection failed');
    }
  }

  async set(key: string, value: string, ...args: Array<string | number>): Promise<void> {
    await (this.client.set as (...params: unknown[]) => Promise<unknown>)(key, value, ...args);
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.client.del(...keys);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.usingMemoryFallback) {
      this.client.disconnect();
      return;
    }
    if (this.client.status !== 'end') await this.client.quit();
  }

  mode(): 'redis' | 'memory' {
    return this.usingMemoryFallback ? 'memory' : 'redis';
  }

  private createMemoryClient(reason: string): Redis {
    this.usingMemoryFallback = true;
    console.warn(`[redis] Using in-memory Redis mock: ${reason}`);
    return new RedisMock() as unknown as Redis;
  }
}
