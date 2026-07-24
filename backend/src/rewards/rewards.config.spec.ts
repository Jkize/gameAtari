import {
  REWARD_PHASE_ONE_SCHEDULE,
  rewardPrizesForPlayerCount,
} from './rewards.config';

describe('phase-one proportional reward configuration', () => {
  it('does not award matches with fewer than four players', () => {
    expect(rewardPrizesForPlayerCount(0)).toEqual([]);
    expect(rewardPrizesForPlayerCount(3)).toEqual([]);
  });

  it.each([
    [4, [{ placement: 1, amount: 400 }]],
    [5, [
      { placement: 1, amount: 475 },
      { placement: 2, amount: 50 },
    ]],
    [8, [
      { placement: 1, amount: 700 },
      { placement: 2, amount: 200 },
    ]],
    [9, [
      { placement: 1, amount: 750 },
      { placement: 2, amount: 235 },
      { placement: 3, amount: 75 },
    ]],
    [16, [
      { placement: 1, amount: 1100 },
      { placement: 2, amount: 480 },
      { placement: 3, amount: 250 },
    ]],
  ])('calculates the exact podium for %i players', (playerCount, expected) => {
    expect(rewardPrizesForPlayerCount(playerCount)).toEqual(expected);
  });

  it('caps unexpected player counts at the configured maximum', () => {
    expect(rewardPrizesForPlayerCount(20)).toEqual(rewardPrizesForPlayerCount(16));
  });

  it('publishes one exact schedule entry for every supported player count', () => {
    expect(REWARD_PHASE_ONE_SCHEDULE.map(entry => entry.playerCount)).toEqual([
      4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    ]);
  });
});
