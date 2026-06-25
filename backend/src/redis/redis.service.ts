import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;
  readonly optional: boolean;

  constructor(config: ConfigService) {
    this.optional = config.get<boolean>('DEV_INFRA_OPTIONAL', false);
    this.client = new Redis(config.getOrThrow<string>('REDIS_URL'), {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
    });
  }

  async ensureConnected(): Promise<void> {
    if (this.optional) return;
    if (this.client.status === 'wait') await this.client.connect();
  }

  async set(key: string, value: string, ...args: Array<string | number>): Promise<void> {
    if (this.optional) return;
    await (this.client.set as (...params: unknown[]) => Promise<unknown>)(key, value, ...args);
  }

  async del(...keys: string[]): Promise<void> {
    if (this.optional || keys.length === 0) return;
    await this.client.del(...keys);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.optional && this.client.status === 'wait') {
      this.client.disconnect();
      return;
    }
    if (this.client.status !== 'end') await this.client.quit();
  }
}
