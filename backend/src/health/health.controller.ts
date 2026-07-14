import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get()
  async health() {
    try {
      await Promise.all([this.prisma.$queryRaw`SELECT 1`, this.redis.client.ping()]);
      return { status: 'ok', postgres: 'up', redis: this.redis.mode() };
    } catch {
      throw new ServiceUnavailableException({
        status: 'degraded',
        postgres: 'unknown',
        redis: this.redis.mode(),
      });
    }
  }
}
