import { buildRewardIdempotencyKey, rewardDateInBogota } from './rewards.types';

describe('reward persistence helpers', () => {
  it('builds deterministic reward idempotency keys by match and placement', () => {
    expect(buildRewardIdempotencyKey('match-123', 2)).toBe('MATCH_REWARD:match-123:2');
  });

  it('calculates reward dates in America/Bogota', () => {
    const utcEarlyMorning = new Date('2026-07-10T03:30:00.000Z');

    expect(rewardDateInBogota(utcEarlyMorning).toISOString()).toBe('2026-07-09T00:00:00.000Z');
  });
});
