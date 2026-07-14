import { ConflictException } from '@nestjs/common';
import { AuthProvider, UserRole } from '@prisma/client';
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

describe('UsersService list', () => {
  const buildRows = (count: number) => Array.from({ length: count }, (_, index) => ({
    id: `user-${String(index).padStart(3, '0')}`,
    username: `pilot${index}`,
    avatarUrl: null,
    role: UserRole.USER,
    active: true,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 0, count - index)),
    accounts: [{ provider: AuthProvider.GOOGLE }, { provider: AuthProvider.PHANTOM }],
  }));

  const createListService = (rows: ReturnType<typeof buildRows>) => {
    const prisma = {
      user: { findMany: jest.fn(async () => rows) },
    };
    return { service: new UsersService(prisma as unknown as PrismaService), prisma };
  };

  const decodeCursor = (cursor: string) =>
    JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { createdAt: string; id: string };

  it('returns a full page with a next cursor pointing at the last item', async () => {
    const rows = buildRows(51);
    const { service } = createListService(rows);

    const result = await service.list();

    expect(result.items).toHaveLength(50);
    expect(result.nextCursor).not.toBeNull();
    expect(decodeCursor(result.nextCursor as string)).toEqual({
      createdAt: rows[49].createdAt.toISOString(),
      id: rows[49].id,
    });
  });

  it('returns a null cursor when there is no next page', async () => {
    const { service } = createListService(buildRows(50));

    const result = await service.list();

    expect(result.items).toHaveLength(50);
    expect(result.nextCursor).toBeNull();
  });

  it('selects only public fields, maps linked providers, and serializes createdAt as ISO string', async () => {
    const rows = buildRows(1);
    const { service, prisma } = createListService(rows);

    const result = await service.list();

    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: {
        id: true,
        username: true,
        avatarUrl: true,
        role: true,
        active: true,
        createdAt: true,
        accounts: { select: { provider: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 51,
    }));
    const { accounts: _accounts, ...publicFields } = rows[0];
    expect(result.items[0]).toEqual({
      ...publicFields,
      createdAt: rows[0].createdAt.toISOString(),
      providers: [AuthProvider.GOOGLE, AuthProvider.PHANTOM],
    });
  });

  it('builds a keyset WHERE clause from a valid cursor', async () => {
    const { service, prisma } = createListService([]);
    const cursor = Buffer.from(JSON.stringify({
      createdAt: '2026-01-01T00:00:00.000Z',
      id: 'user-000',
    })).toString('base64url');

    await service.list(cursor);

    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        OR: [
          { createdAt: { lt: new Date('2026-01-01T00:00:00.000Z') } },
          { createdAt: new Date('2026-01-01T00:00:00.000Z'), id: { lt: 'user-000' } },
        ],
      },
    }));
  });

  it('treats a malformed cursor as no cursor instead of throwing', async () => {
    const { service, prisma } = createListService([]);

    await service.list('not-a-valid-cursor');

    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: undefined,
    }));
  });
});
