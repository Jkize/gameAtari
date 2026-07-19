import { Controller, Get, Post, Query } from '@nestjs/common';
import { Allow } from '../auth/decorators/allow.decorator';
import { EAuth } from '../common/auth.types';
import { StatsService } from './stats.service';

@Controller('admin')
export class AdminStatsController {
  constructor(private readonly stats: StatsService) {}

  @Allow(EAuth.ADMIN)
  @Get('stats')
  getAdminStats() {
    return this.stats.getAdminStats();
  }

  @Allow(EAuth.ADMIN)
  @Get('stats/live')
  getLiveStats() {
    return this.stats.getLiveStats();
  }

  @Allow(EAuth.ADMIN)
  @Get('stats/history')
  getHistory(@Query('from') from?: string, @Query('to') to?: string) {
    const end = this.validDate(to) ?? new Date();
    const start = this.validDate(from) ?? new Date(end.getTime() - 24 * 60 * 60 * 1000);
    return this.stats.getHistory(start, end);
  }

  @Allow(EAuth.ADMIN)
  @Post('stats/flush')
  async flush() {
    return { inserted: await this.stats.flushHistory() };
  }

  private validDate(value?: string): Date | null {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
}
