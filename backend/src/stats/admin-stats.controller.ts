import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { StatsService } from './stats.service';

@Controller('admin')
export class AdminStatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('stats')
  @UseGuards(AdminGuard)
  getAdminStats() {
    return this.stats.getAdminStats();
  }
}
