jest.mock('@solana/web3.js', () => ({
  PublicKey: class PublicKey {
    constructor(readonly value: string) {}
  },
}));

import { SolanaConfigService } from '../solana/solana-config.service';
import { RewardProcessorScheduler } from './reward-processor.scheduler';
import { RewardProcessorService } from './reward-processor.service';

describe('RewardProcessorScheduler', () => {
  it('does not overlap ticks', async () => {
    let release!: () => void;
    const processor = {
      processBatch: jest.fn(() => new Promise<void>(resolve => { release = resolve; })),
    };
    const config = {
      rewardsEnabled: jest.fn(() => true),
      rewardProcessorEnabled: jest.fn(() => false),
      rewardProcessorIntervalMs: jest.fn(() => 5000),
    };
    const scheduler = new RewardProcessorScheduler(
      config as unknown as SolanaConfigService,
      processor as unknown as RewardProcessorService,
    );

    const first = scheduler.tick();
    const second = scheduler.tick();
    release();
    await Promise.all([first, second]);

    expect(processor.processBatch).toHaveBeenCalledTimes(1);
  });

  it('runs one processor batch on tick', async () => {
    const processor = {
      processBatch: jest.fn(async () => 0),
    };
    const config = {
      rewardsEnabled: jest.fn(() => true),
      rewardProcessorEnabled: jest.fn(() => false),
      rewardProcessorIntervalMs: jest.fn(() => 5000),
    };
    const scheduler = new RewardProcessorScheduler(
      config as unknown as SolanaConfigService,
      processor as unknown as RewardProcessorService,
    );

    await scheduler.tick();

    expect(processor.processBatch).toHaveBeenCalledTimes(1);
  });

  it('does not start the interval when rewards are disabled', () => {
    jest.useFakeTimers();
    const processor = { processBatch: jest.fn(async () => 0) };
    const config = {
      rewardsEnabled: jest.fn(() => false),
      rewardProcessorEnabled: jest.fn(() => true),
      rewardProcessorIntervalMs: jest.fn(() => 5000),
    };
    const scheduler = new RewardProcessorScheduler(
      config as unknown as SolanaConfigService,
      processor as unknown as RewardProcessorService,
    );

    scheduler.onModuleInit();
    jest.advanceTimersByTime(15_000);

    expect(processor.processBatch).not.toHaveBeenCalled();
    expect(config.rewardProcessorIntervalMs).not.toHaveBeenCalled();
    scheduler.onModuleDestroy();
    jest.useRealTimers();
  });
});
