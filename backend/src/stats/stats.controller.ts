import { Controller, Get } from '@nestjs/common';
import { seconds, Throttle } from '@nestjs/throttler';
import { StatsService } from './stats.service';

@Controller('stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('public')
  @Throttle({ default: { limit: 30, ttl: seconds(60) } })
  getPublic() {
    return this.stats.getPublicStats();
  }
}
