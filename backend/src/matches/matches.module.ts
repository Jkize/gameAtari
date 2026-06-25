import { Module } from '@nestjs/common';
import { RewardsModule } from '../rewards/rewards.module';
import { MatchesService } from './matches.service';

@Module({
  imports: [RewardsModule],
  providers: [MatchesService],
  exports: [MatchesService],
})
export class MatchesModule {}
