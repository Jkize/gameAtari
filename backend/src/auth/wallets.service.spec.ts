jest.mock('@solana/web3.js', () => ({
  PublicKey: class PublicKey {
    constructor(readonly value: string) {}
  },
}));

import { AuthProvider } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SolanaConfigService } from '../solana/solana-config.service';
import { SolanaGateway } from '../solana/solana.types';
import { WalletsService } from './wallets.service';

describe('WalletsService', () => {
  const createHarness = (wallet: unknown, balance?: bigint, throws = false) => {
    const prisma = {
      authAccount: {
        findMany: jest.fn(async () => [{ provider: AuthProvider.GOOGLE }]),
      },
      wallet: {
        findFirst: jest.fn(async () => wallet),
      },
    };
    const solanaConfig = {
      rewardsEnabled: jest.fn(() => true),
      mint: jest.fn(() => 'mint-1'),
    };
    const solana = {
      getTokenBalance: jest.fn(async () => {
        if (throws) throw new Error('rpc down');
        return { kind: 'found', amountRaw: balance ?? 0n, decimals: 2 };
      }),
    };
    const service = new WalletsService(
      prisma as unknown as PrismaService,
      solanaConfig as unknown as SolanaConfigService,
      solana as unknown as SolanaGateway,
    );
    return { service, solana };
  };

  it('returns unknown holder status without Phantom', async () => {
    const { service, solana } = createHarness(null);

    const result = await service.statusForUser('user-1', AuthProvider.GOOGLE);

    expect(result.phantom.verified).toBe(false);
    expect(result.holder.status).toBe('unknown');
    expect(solana.getTokenBalance).not.toHaveBeenCalled();
  });

  it('returns eligible holder status at 10k tokens', async () => {
    const { service } = createHarness({
      address: 'WalletAddress111111',
      verifiedAt: new Date(),
    }, 1_000_000n);

    const result = await service.statusForUser('user-1', AuthProvider.GOOGLE);

    expect(result.phantom.addressPreview).toBe('Wall...1111');
    expect(result.holder.status).toBe('eligible');
    expect(result.holder.balance).toBe('10000');
  });

  it('returns insufficient holder status below 10k tokens', async () => {
    const { service } = createHarness({
      address: 'WalletAddress111111',
      verifiedAt: new Date(),
    }, 999_999n);

    const result = await service.statusForUser('user-1', AuthProvider.GOOGLE);

    expect(result.holder.status).toBe('insufficient');
    expect(result.holder.balance).toBe('9999.99');
  });

  it('does not report insufficient when Helius fails', async () => {
    const { service } = createHarness({
      address: 'WalletAddress111111',
      verifiedAt: new Date(),
    }, 0n, true);

    const result = await service.statusForUser('user-1', AuthProvider.GOOGLE);

    expect(result.holder.status).toBe('unavailable');
  });
});
