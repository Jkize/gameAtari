import { Controller, Get } from '@nestjs/common';
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
}
