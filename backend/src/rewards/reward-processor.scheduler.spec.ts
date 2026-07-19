jest.mock('@solana/web3.js', () => ({
  PublicKey: class PublicKey {
    constructor(readonly value: string) {}
  },
}));

import { SolanaConfigService } from '../solana/solana-config.service';
import { RewardProcessorScheduler } from './reward-processor.scheduler';
import { RewardProcessorService } from './reward-processor.service';
import { RuntimeActivityService } from '../runtime/runtime-activity.service';
import { Logger } from '@nestjs/common';

describe('RewardProcessorScheduler', () => {
  const activity = {
    hasRecentMultiplayerActivity: jest.fn(() => true),
  } as unknown as RuntimeActivityService;

  afterEach(() => jest.restoreAllMocks());
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
      activity,
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
      activity,
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
      activity,
    );

    scheduler.onModuleInit();
    jest.advanceTimersByTime(15_000);

    expect(processor.processBatch).not.toHaveBeenCalled();
    expect(config.rewardProcessorIntervalMs).not.toHaveBeenCalled();
    scheduler.onModuleDestroy();
    jest.useRealTimers();
  });

  it('reschedules known work when processing fails', async () => {
    const processor = {
      processBatch: jest.fn(async () => { throw new Error('database unavailable'); }),
    };
    const config = {
      rewardsEnabled: jest.fn(() => true),
      rewardProcessorEnabled: jest.fn(() => true),
      rewardProcessorIntervalMs: jest.fn(() => 15_000),
    };
    const scheduler = new RewardProcessorScheduler(
      config as unknown as SolanaConfigService,
      processor as unknown as RewardProcessorService,
      activity,
    );
    const schedule = jest.spyOn(scheduler as never, 'scheduleKnownWork' as never).mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    (scheduler as unknown as { trackingKnownWork: boolean }).trackingKnownWork = true;
    const before = Date.now();

    await scheduler.tick();

    expect(schedule).toHaveBeenCalledWith(expect.any(Date));
    const retryAt = schedule.mock.calls[0][0] as Date;
    expect(retryAt.getTime()).toBeGreaterThanOrEqual(before + 15_000);
  });
});
