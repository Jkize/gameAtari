import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SolanaModule } from '../solana/solana.module';
import { RewardProcessorScheduler } from './reward-processor.scheduler';
import { RewardProcessorService } from './reward-processor.service';
import { RewardReconcilerService } from './reward-reconciler.service';
import { RewardsHistoryController } from './rewards-history.controller';
import { RewardsHistoryService } from './rewards-history.service';
import { RewardsRepository } from './rewards.repository';
import { RewardsService } from './rewards.service';
import { RuntimeModule } from '../runtime/runtime.module';

/**
 * Owns all reward eligibility, payment, history and retry/reconciliation providers.
 * Other modules (e.g. `MatchesModule`, `GameModule`) must import this module rather than
 * re-declaring these providers, to avoid duplicate scheduler/processor instances.
 */
@Module({
  imports: [AuthModule, SolanaModule, RuntimeModule],
  controllers: [RewardsHistoryController],
  providers: [
    RewardsService,
    RewardsRepository,
    RewardsHistoryService,
    RewardReconcilerService,
    RewardProcessorService,
    RewardProcessorScheduler,
  ],
  exports: [RewardsService, RewardProcessorService, RewardProcessorScheduler],
})
export class RewardsModule {}
