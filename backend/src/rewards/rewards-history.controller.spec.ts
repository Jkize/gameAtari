jest.mock('@solana/web3.js', () => ({
  PublicKey: class PublicKey {
    constructor(readonly value: string) {}
  },
}));

import { Test } from '@nestjs/testing';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import request from 'supertest';
import { SolanaConfigService } from '../solana/solana-config.service';
import { RewardsHistoryController } from './rewards-history.controller';
import { RewardsHistoryService } from './rewards-history.service';

describe('RewardsHistoryController', () => {
  it('keeps recent matches private and requires authentication metadata', async () => {
    const history = {
      recentMatches: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    };
    const module = await Test.createTestingModule({
      controllers: [RewardsHistoryController],
      providers: [
        { provide: RewardsHistoryService, useValue: history },
        { provide: SolanaConfigService, useValue: {} },
      ],
    }).compile();
    const app = module.createNestApplication();
    await app.init();

    try {
      await request(app.getHttpServer())
        .get('/rewards/matches/recent')
        .expect(200)
        .expect('Cache-Control', 'private, no-store');
      expect(history.recentMatches).toHaveBeenCalledWith(undefined);
      expect(Reflect.getMetadata(
        IS_PUBLIC_KEY,
        RewardsHistoryController.prototype.recentMatches,
      )).toBeUndefined();
      expect(Reflect.getMetadata(
        IS_PUBLIC_KEY,
        RewardsHistoryController.prototype.matchDetail,
      )).toBeUndefined();
    } finally {
      await app.close();
    }
  });
});
