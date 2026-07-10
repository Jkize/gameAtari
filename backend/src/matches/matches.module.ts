import { Module } from '@nestjs/common';
import { RewardsModule } from '../rewards/rewards.module';
import { MatchResultsRepository } from './match-results.repository';
import { MatchesService } from './matches.service';

@Module({
  imports: [RewardsModule],
  providers: [MatchesService, MatchResultsRepository],
  exports: [MatchesService],
})
export class MatchesModule {}
