import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GameModule } from '../games/tanks/game.module';
import { AdminStatsController } from './admin-stats.controller';
import { AdminGuard } from './admin.guard';
import { PublicRateLimiterService } from './public-rate-limiter.service';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

@Module({
  imports: [GameModule, AuthModule],
  controllers: [StatsController, AdminStatsController],
  providers: [StatsService, PublicRateLimiterService, AdminGuard],
})
export class StatsModule {}
