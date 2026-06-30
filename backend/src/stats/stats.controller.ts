import { Controller, Get, Req } from '@nestjs/common';
import { Request } from 'express';
import { PublicRateLimiterService } from './public-rate-limiter.service';
import { StatsService } from './stats.service';

@Controller('stats')
export class StatsController {
  constructor(
    private readonly stats: StatsService,
    private readonly rateLimiter: PublicRateLimiterService,
  ) {}

  @Get('public')
  getPublic(@Req() req: Request) {
    const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
      ?? req.socket.remoteAddress
      ?? 'unknown';
    this.rateLimiter.check(ip);
    return this.stats.getPublicStats();
  }
}
