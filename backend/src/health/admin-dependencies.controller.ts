import { Controller, Get } from '@nestjs/common';
import { Allow } from '../auth/decorators/allow.decorator';
import { EAuth } from '../common/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Controller('admin/health')
export class AdminDependenciesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Allow(EAuth.ADMIN)
  @Get('dependencies')
  async dependencies() {
    const startedAt = performance.now();
    const [postgres, redis] = await Promise.allSettled([
      this.measure(() => this.prisma.$queryRaw`SELECT 1`),
      this.measure(() => this.redis.client.ping()),
    ]);
    return {
      status: postgres.status === 'fulfilled' && redis.status === 'fulfilled' ? 'ok' : 'degraded',
      checkedAt: new Date().toISOString(),
      totalLatencyMs: Math.round(performance.now() - startedAt),
      postgres: this.result(postgres),
      redis: this.result(redis),
    };
  }

  private async measure(action: () => Promise<unknown>): Promise<number> {
    const startedAt = performance.now();
    await action();
    return Math.round(performance.now() - startedAt);
  }

  private result(result: PromiseSettledResult<number>) {
    return result.status === 'fulfilled'
      ? { status: 'up', latencyMs: result.value }
      : { status: 'down', latencyMs: null };
  }
}
