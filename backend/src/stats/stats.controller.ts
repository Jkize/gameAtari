import { Controller, Get } from '@nestjs/common';
import { seconds, Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { StatsService } from './stats.service';

@Controller('stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Public()
  @Get('public')
  @Throttle({ default: { limit: 30, ttl: seconds(60) } })
  getPublic() {
    return this.stats.getPublicStats();
  }
}
