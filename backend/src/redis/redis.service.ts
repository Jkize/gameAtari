import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_KEY_PREFIX = 'tkgame:';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor(config: ConfigService) {
    this.client = new Redis(config.getOrThrow<string>('REDIS_URL'), {
      keyPrefix: REDIS_KEY_PREFIX,
      lazyConnect: true,
      maxRetriesPerRequest: 2,
    });
    this.client.on('error', () => undefined);
  }

  async ensureConnected(): Promise<void> {
    try {
      if (this.client.status === 'wait') await this.client.connect();
      await this.client.ping();
    } catch (error) {
      this.client.disconnect();
      throw new Error('Redis connection failed', { cause: error });
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
    if (this.client.status !== 'end') await this.client.quit();
  }
}
