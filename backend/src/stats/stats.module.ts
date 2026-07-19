import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GameModule } from '../games/tanks/game.module';
import { AdminStatsController } from './admin-stats.controller';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';
import { RuntimeModule } from '../runtime/runtime.module';

@Module({
  imports: [GameModule, AuthModule, RuntimeModule],
  controllers: [StatsController, AdminStatsController],
  providers: [StatsService],
})
export class StatsModule {}
