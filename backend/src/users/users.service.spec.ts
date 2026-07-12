import { ConflictException } from '@nestjs/common';
import { AuthProvider } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService account linking', () => {
  const createHarness = (overrides: Partial<Record<string, unknown>> = {}) => {
    const tx = {
      wallet: {
        findUnique: jest.fn()
          .mockResolvedValueOnce(overrides['linkedWallet'] ?? null)
          .mockResolvedValueOnce(overrides['userWallet'] ?? null),
        upsert: jest.fn(async () => undefined),
      },
      authAccount: {
        findUnique: jest.fn(async () => overrides['linkedAccount'] ?? null),
        findFirst: jest.fn(async () => overrides['userPhantomAccount'] ?? null),
        upsert: jest.fn(async () => undefined),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (value: typeof tx) => unknown) => callback(tx)),
    };
    const service = new UsersService(prisma as unknown as PrismaService);
    return { service, tx };
  };

  it('links a Phantom wallet to the current user', async () => {
    const { service, tx } = createHarness();

    await service.linkPhantomWallet('user-1', 'wallet-1', 'message-1');

    expect(tx.wallet.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        userId: 'user-1',
        provider: AuthProvider.PHANTOM,
        address: 'wallet-1',
      }),
    }));
    expect(tx.authAccount.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        userId: 'user-1',
        provider: AuthProvider.PHANTOM,
        providerAccountId: 'wallet-1',
      }),
    }));
  });

  it('rejects a Phantom wallet linked to another user', async () => {
    const { service } = createHarness({
      linkedWallet: { userId: 'user-2' },
    });

    const action = service.linkPhantomWallet('user-1', 'wallet-1', 'message-1');

    await expect(action).rejects.toBeInstanceOf(ConflictException);
    await expect(action).rejects.toMatchObject({
      response: expect.objectContaining({ message: 'account.accountInUse' }),
    });
  });
});

describe('UsersService username errors', () => {
  const createUsernameService = (existing: { id: string } | null = null) => {
    const prisma = {
      user: {
        findFirst: jest.fn(async () => existing),
        update: jest.fn(async ({ data }: { data: object }) => ({ id: 'user-1', ...data })),
      },
    };
    return new UsersService(prisma as unknown as PrismaService);
  };

  it('returns an i18n key for an invalid username', async () => {
    const action = createUsernameService().setUsername('user-1', 'no spaces');

    await expect(action).rejects.toMatchObject({
      response: expect.objectContaining({ message: 'auth.usernameInvalid' }),
    });
  });

  it('returns an i18n key for a username already in use', async () => {
    const action = createUsernameService({ id: 'user-2' }).setUsername('user-1', 'Pilot_1');

    await expect(action).rejects.toMatchObject({
      response: expect.objectContaining({ message: 'auth.usernameInUse' }),
    });
  });
});
