import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SolanaConfigService } from '../solana/solana-config.service';
import { RewardProcessorService } from './reward-processor.service';
import { RuntimeActivityService } from '../runtime/runtime-activity.service';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { dirname } from 'path';

/**
 * Drives {@link RewardProcessorService.processBatch} on a fixed interval. Must be provided
 * only once (via `RewardsModule`) to avoid duplicate scheduler instances double-processing rewards.
 */
@Injectable()
export class RewardProcessorScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RewardProcessorScheduler.name);
  private timer?: NodeJS.Timeout;
  private knownWorkTimer?: NodeJS.Timeout;
  private running = false;
  private trackingKnownWork = false;
  private signalMutation: Promise<void> = Promise.resolve();
  private readonly signalFile = process.env.NODE_ENV === 'production'
    ? '/app/data/rewards/pending-work.json'
    : './data/rewards/pending-work.json';

  constructor(
    private readonly config: SolanaConfigService,
    private readonly processor: RewardProcessorService,
    private readonly activity: RuntimeActivityService,
  ) {}

  /** Starts the interval timer if reward processing is enabled for this environment. */
  async onModuleInit(): Promise<void> {
    if (!this.config.rewardsEnabled() || !this.config.rewardProcessorEnabled()) return;
    this.timer = setInterval(() => {
      if (this.activity.hasRecentMultiplayerActivity()) void this.tick();
    }, this.config.rewardProcessorIntervalMs());
    try {
      const signal = JSON.parse(await readFile(this.signalFile, 'utf8')) as { dueAt?: string };
      this.scheduleKnownWork(signal.dueAt ? new Date(signal.dueAt) : new Date());
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn('Reward work signal could not be restored');
      }
    }
  }

  /** Stops the interval timer on shutdown. */
  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.knownWorkTimer) clearTimeout(this.knownWorkTimer);
  }

  /** Called after a match registers rewards so payment starts immediately. */
  requestProcessing(): void {
    if (!this.config.rewardsEnabled() || !this.config.rewardProcessorEnabled()) return;
    this.scheduleKnownWork(new Date());
  }

  /** Runs one processor batch, skipping if a previous tick is still in flight. */
  async tick(): Promise<void> {
    if (this.running) {
      if (this.trackingKnownWork) this.scheduleKnownWork(this.retryAfterProcessorInterval());
      return;
    }
    this.running = true;
    try {
      const processed = await this.processor.processBatch();
      if (processed > 0 || this.trackingKnownWork) {
        this.scheduleKnownWork(await this.processor.nextAutomaticWorkAt());
      }
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : 'Reward processor tick failed');
      if (this.trackingKnownWork) this.scheduleKnownWork(this.retryAfterProcessorInterval());
    } finally {
      this.running = false;
    }
  }


  private scheduleKnownWork(dueAt: Date | null): void {
    if (this.knownWorkTimer) clearTimeout(this.knownWorkTimer);
    this.knownWorkTimer = undefined;
    if (!dueAt) {
      this.trackingKnownWork = false;
      this.persistKnownWorkSignal(null);
      return;
    }
    this.trackingKnownWork = true;
    this.persistKnownWorkSignal(dueAt);
    const delayMs = Math.max(1_000, dueAt.getTime() - Date.now());
    this.knownWorkTimer = setTimeout(() => {
      this.knownWorkTimer = undefined;
      void this.tick();
    }, delayMs);
  }

  private retryAfterProcessorInterval(): Date {
    return new Date(Date.now() + this.config.rewardProcessorIntervalMs());
  }

  private persistKnownWorkSignal(dueAt: Date | null): void {
    this.signalMutation = this.signalMutation
      .then(async () => {
        if (!dueAt) {
          await rm(this.signalFile, { force: true });
          return;
        }
        await mkdir(dirname(this.signalFile), { recursive: true });
        await writeFile(this.signalFile, JSON.stringify({ dueAt: dueAt.toISOString() }), 'utf8');
      })
      .catch(error => {
        this.logger.warn(`Reward work signal could not be ${dueAt ? 'saved' : 'removed'}: ${error instanceof Error ? error.message : error}`);
      });
  }
}
