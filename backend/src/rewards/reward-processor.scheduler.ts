import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SolanaConfigService } from '../solana/solana-config.service';
import { RewardProcessorService } from './reward-processor.service';

/**
 * Drives {@link RewardProcessorService.processBatch} on a fixed interval. Must be provided
 * only once (via `RewardsModule`) to avoid duplicate scheduler instances double-processing rewards.
 */
@Injectable()
export class RewardProcessorScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RewardProcessorScheduler.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly config: SolanaConfigService,
    private readonly processor: RewardProcessorService,
  ) {}

  /** Starts the interval timer if reward processing is enabled for this environment. */
  onModuleInit(): void {
    if (!this.config.rewardProcessorEnabled()) return;
    this.timer = setInterval(() => void this.tick(), this.config.rewardProcessorIntervalMs());
  }

  /** Stops the interval timer on shutdown. */
  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Runs one processor batch, skipping if a previous tick is still in flight. */
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.processor.processBatch();
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : 'Reward processor tick failed');
    } finally {
      this.running = false;
    }
  }
}
