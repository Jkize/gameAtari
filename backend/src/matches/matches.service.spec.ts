jest.mock('@solana/web3.js', () => ({
  PublicKey: class PublicKey {
    constructor(readonly value: string) {}
  },
}));

import { Logger } from '@nestjs/common';
import { GameSessionsService } from '../games/tanks/runtime/game-sessions.service';
import { RewardsService } from '../rewards/rewards.service';
import { MatchResultsRepository } from './match-results.repository';
import { MatchesService } from './matches.service';

describe('MatchesService', () => {
  const userId = '00000000-0000-4000-8000-000000000001';

  const createHarness = () => {
    const state = {
      persisted: false,
      rewardsEligible: true,
      startedAt: new Date('2026-07-09T20:00:00.000Z'),
      endedAt: new Date('2026-07-09T20:05:00.000Z'),
      players: new Map([[userId, { id: userId, alive: true }]]),
      eliminationOrder: [],
      stats: new Map([[userId, {
        kills: 2,
        deaths: 0,
        damageDealt: 300,
        damageTaken: 50,
      }]]),
      map: { name: 'Arena' },
    };
    const sessions = {
      get: jest.fn(() => state),
    };
    const matchResults = {
      persistCompleted: jest.fn(async () => 'match-1'),
    };
    const rewards = {
      registerMatchRewards: jest.fn(async () => undefined),
      registerDisabledMatchRewards: jest.fn(async () => undefined),
    };
    const service = new MatchesService(
      sessions as unknown as GameSessionsService,
      matchResults as unknown as MatchResultsRepository,
      rewards as unknown as RewardsService,
    );
    return { matchResults, rewards, service, state };
  };

  it('persists a completed match and registers top placement rewards', async () => {
    const { matchResults, rewards, service } = createHarness();

    const result = await service.persist('room-1');

    expect(result).toBe('match-1');
    expect(matchResults.persistCompleted).toHaveBeenCalledWith(expect.objectContaining({
      roomId: 'room-1',
      winnerUserId: userId,
    }));
    expect(rewards.registerMatchRewards).toHaveBeenCalledWith([{
      matchId: 'match-1',
      userId,
      placement: 1,
    }]);
  });

  it('keeps the match persisted when reward registration fails', async () => {
    const { rewards, service, state } = createHarness();
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    rewards.registerMatchRewards.mockRejectedValue(new Error('Helius unavailable'));

    const result = await service.persist('room-1');

    expect(result).toBe('match-1');
    expect(state.persisted).toBe(true);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it('persists private matches without registering rewards', async () => {
    const { matchResults, rewards, service, state } = createHarness();
    state.rewardsEligible = false;

    await service.persist('private-room');

    expect(matchResults.persistCompleted).toHaveBeenCalledWith(expect.objectContaining({
      roomId: 'private-room',
      rewardsEligible: false,
    }));
    expect(rewards.registerMatchRewards).not.toHaveBeenCalled();
    expect(rewards.registerDisabledMatchRewards).toHaveBeenCalledWith([{
      matchId: 'match-1',
      userId,
      placement: 1,
    }]);
  });

  it('unmarks persisted when storing the match itself fails', async () => {
    const { matchResults, rewards, service, state } = createHarness();
    matchResults.persistCompleted.mockRejectedValue(new Error('database down'));

    await expect(service.persist('room-1')).rejects.toThrow('database down');

    expect(state.persisted).toBe(false);
    expect(rewards.registerMatchRewards).not.toHaveBeenCalled();
  });
});
