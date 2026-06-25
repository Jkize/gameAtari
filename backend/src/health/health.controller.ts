import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ConfigService } from '@nestjs/config';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  async health() {
    if (this.config.get<boolean>('DEV_INFRA_OPTIONAL', false)) {
      return { status: 'ok', mode: 'development', postgres: 'skipped', redis: 'skipped' };
    }
    try {
      await Promise.all([this.prisma.$queryRaw`SELECT 1`, this.redis.client.ping()]);
      return { status: 'ok', postgres: 'up', redis: 'up' };
    } catch {
      throw new ServiceUnavailableException({ status: 'degraded', postgres: 'unknown', redis: 'unknown' });
    }
  }
}
