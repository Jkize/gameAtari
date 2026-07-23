import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthProvider, Prisma, TutorialStatus, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  TANK_CUSTOMIZATION_SETTING_KEY,
  createStoredTankCustomization,
} from '../tank-customization/tank-customization.types';

interface GoogleIdentity {
  subject: string;
  email: string;
  avatarUrl?: string;
}

const LIST_PAGE_SIZE = 50;

export type UserSortField = 'createdAt' | 'lastConnectionAt';
export type SortOrder = 'asc' | 'desc';

export const USER_SORT_FIELDS: readonly UserSortField[] = ['createdAt', 'lastConnectionAt'];

interface UserListCursor {
  sortBy: UserSortField;
  sortValue: string | null;
  id: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Admin listing of users, sortable by `createdAt` or `lastConnectionAt`. Cursor-paginated keyset style, nulls always sort last, capped at `LIST_PAGE_SIZE` rows per page. */
  async list(cursor?: string | null, sortBy: UserSortField = 'createdAt', order: SortOrder = 'desc') {
    const rows = await this.prisma.user.findMany({
      where: this.listCursorWhere(cursor, sortBy, order),
      select: {
        id: true,
        username: true,
        avatarUrl: true,
        role: true,
        active: true,
        createdAt: true,
        lastConnectionAt: true,
        accounts: { select: { provider: true } },
      },
      orderBy: sortBy === 'lastConnectionAt'
        ? [{ lastConnectionAt: { sort: order, nulls: 'last' } }, { id: order }]
        : [{ createdAt: order }, { id: order }],
      take: LIST_PAGE_SIZE + 1,
    });
    const items = rows.slice(0, LIST_PAGE_SIZE);
    return {
      items: items.map(({ accounts, ...user }) => ({
        ...user,
        createdAt: user.createdAt.toISOString(),
        lastConnectionAt: user.lastConnectionAt ? user.lastConnectionAt.toISOString() : null,
        providers: [...new Set(accounts.map(account => account.provider))],
      })),
      nextCursor: this.listNextCursor(items, rows.length > LIST_PAGE_SIZE, sortBy),
    };
  }

  /** Translates an opaque page cursor into a Prisma `WHERE` clause that continues strictly after that cursor's `(sortBy, id)`, per the requested sort. A cursor sorted by a different field is treated as absent. */
  private listCursorWhere(
    cursor: string | null | undefined,
    sortBy: UserSortField,
    order: SortOrder,
  ): Prisma.UserWhereInput | undefined {
    const decoded = this.decodeListCursor(cursor);
    if (!decoded || decoded.sortBy !== sortBy) return undefined;
    const op = order === 'desc' ? 'lt' : 'gt';
    if (decoded.sortValue === null) {
      return { [sortBy]: null, id: { [op]: decoded.id } } as Prisma.UserWhereInput;
    }
    const sortDate = new Date(decoded.sortValue);
    return {
      OR: [
        { [sortBy]: { [op]: sortDate } },
        { [sortBy]: sortDate, id: { [op]: decoded.id } },
        { [sortBy]: null },
      ],
    } as Prisma.UserWhereInput;
  }

  /** Builds the opaque base64url cursor for the next page from the last item on the current page, or `null` if there is no next page. */
  private listNextCursor(
    items: { id: string; createdAt: Date; lastConnectionAt: Date | null }[],
    hasNext: boolean,
    sortBy: UserSortField,
  ): string | null {
    if (!hasNext || !items.length) return null;
    const last = items[items.length - 1];
    const sortValue = last[sortBy];
    return Buffer.from(JSON.stringify({
      sortBy,
      sortValue: sortValue ? sortValue.toISOString() : null,
      id: last.id,
    } satisfies UserListCursor)).toString('base64url');
  }

  /** Parses and validates an opaque cursor, returning `null` for missing/malformed/invalid input rather than throwing. */
  private decodeListCursor(cursor?: string | null): UserListCursor | null {
    if (!cursor) return null;
    try {
      const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Partial<UserListCursor>;
      if (typeof parsed.id !== 'string' || !parsed.id) return null;
      if (!parsed.sortBy || !USER_SORT_FIELDS.includes(parsed.sortBy)) return null;
      if (parsed.sortValue !== null) {
        if (!parsed.sortValue || Number.isNaN(new Date(parsed.sortValue).getTime())) return null;
      }
      return { sortBy: parsed.sortBy, sortValue: parsed.sortValue, id: parsed.id };
    } catch {
      return null;
    }
  }

  findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: { accounts: true },
    });
  }

  async requireById(id: string) {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async upsertGoogle(identity: GoogleIdentity): Promise<User> {
    const account = await this.prisma.authAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: AuthProvider.GOOGLE,
          providerAccountId: identity.subject,
        },
      },
      include: { user: true },
    });
    if (account) {
      if (identity.avatarUrl && account.user.avatarUrl !== identity.avatarUrl) {
        return this.prisma.user.update({
          where: { id: account.userId },
          data: { avatarUrl: identity.avatarUrl },
        });
      }
      return account.user;
    }

    return this.prisma.$transaction(async tx => {
      const user = await tx.user.create({
        data: {
          avatarUrl: identity.avatarUrl,
          settings: {
            create: {
              key: TANK_CUSTOMIZATION_SETTING_KEY,
              data: createStoredTankCustomization() as Prisma.InputJsonValue,
            },
          },
        },
      });
      await tx.authAccount.create({
        data: {
          userId: user.id,
          provider: AuthProvider.GOOGLE,
          providerAccountId: identity.subject,
          email: identity.email.toLowerCase(),
        },
      });
      return user;
    });
  }

  async upsertPhantom(walletAddress: string): Promise<User> {
    const account = await this.prisma.authAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: AuthProvider.PHANTOM,
          providerAccountId: walletAddress,
        },
      },
      include: { user: true },
    });
    if (account) {
      await this.prisma.wallet.upsert({
        where: {
          userId_provider: {
            userId: account.userId,
            provider: AuthProvider.PHANTOM,
          },
        },
        create: {
          userId: account.userId,
          provider: AuthProvider.PHANTOM,
          address: walletAddress,
          verifiedAt: new Date(),
        },
        update: {
          verifiedAt: new Date(),
          revokedAt: null,
        },
      });
      return account.user;
    }

    return this.prisma.$transaction(async tx => {
      const user = await tx.user.create({
        data: {
          settings: {
            create: {
              key: TANK_CUSTOMIZATION_SETTING_KEY,
              data: createStoredTankCustomization() as Prisma.InputJsonValue,
            },
          },
        },
      });
      await tx.authAccount.create({
        data: {
          userId: user.id,
          provider: AuthProvider.PHANTOM,
          providerAccountId: walletAddress,
          walletAddress,
        },
      });
      await tx.wallet.create({
        data: {
          userId: user.id,
          provider: AuthProvider.PHANTOM,
          address: walletAddress,
          verifiedAt: new Date(),
        },
      });
      return user;
    });
  }

  async linkGoogleAccount(userId: string, identity: GoogleIdentity): Promise<void> {
    await this.prisma.$transaction(async tx => {
      const linkedElsewhere = await tx.authAccount.findUnique({
        where: {
          provider_providerAccountId: {
            provider: AuthProvider.GOOGLE,
            providerAccountId: identity.subject,
          },
        },
        select: { userId: true },
      });
      if (linkedElsewhere && linkedElsewhere.userId !== userId) {
        throw new ConflictException('account.accountInUse');
      }

      const existingGoogle = await tx.authAccount.findFirst({
        where: { userId, provider: AuthProvider.GOOGLE },
        select: { providerAccountId: true },
      });
      if (existingGoogle && existingGoogle.providerAccountId !== identity.subject) {
        throw new ConflictException('account.googleAlreadyLinked');
      }

      await tx.authAccount.upsert({
        where: {
          provider_providerAccountId: {
            provider: AuthProvider.GOOGLE,
            providerAccountId: identity.subject,
          },
        },
        create: {
          userId,
          provider: AuthProvider.GOOGLE,
          providerAccountId: identity.subject,
          email: identity.email.toLowerCase(),
        },
        update: {
          email: identity.email.toLowerCase(),
        },
      });

      if (identity.avatarUrl) {
        await tx.user.update({
          where: { id: userId },
          data: { avatarUrl: identity.avatarUrl },
        });
      }
    });
  }

  async linkPhantomWallet(userId: string, walletAddress: string, verificationMessage: string): Promise<void> {
    await this.prisma.$transaction(async tx => {
      const linkedWallet = await tx.wallet.findUnique({
        where: { address: walletAddress },
        select: { userId: true },
      });
      if (linkedWallet && linkedWallet.userId !== userId) {
        throw new ConflictException('account.accountInUse');
      }

      const linkedAccount = await tx.authAccount.findUnique({
        where: {
          provider_providerAccountId: {
            provider: AuthProvider.PHANTOM,
            providerAccountId: walletAddress,
          },
        },
        select: { userId: true },
      });
      if (linkedAccount && linkedAccount.userId !== userId) {
        throw new ConflictException('account.accountInUse');
      }

      const userWallet = await tx.wallet.findUnique({
        where: {
          userId_provider: {
            userId,
            provider: AuthProvider.PHANTOM,
          },
        },
        select: { address: true, verifiedAt: true },
      });
      if (userWallet && userWallet.address !== walletAddress) {
        throw new ConflictException('account.phantomAlreadyLinked');
      }

      const userPhantomAccount = await tx.authAccount.findFirst({
        where: { userId, provider: AuthProvider.PHANTOM },
        select: { providerAccountId: true },
      });
      if (userPhantomAccount && userPhantomAccount.providerAccountId !== walletAddress) {
        throw new ConflictException('account.phantomAlreadyLinked');
      }

      await tx.wallet.upsert({
        where: {
          userId_provider: {
            userId,
            provider: AuthProvider.PHANTOM,
          },
        },
        create: {
          userId,
          provider: AuthProvider.PHANTOM,
          address: walletAddress,
          verifiedAt: new Date(),
          verificationMessage,
        },
        update: {
          verifiedAt: new Date(),
          verificationMessage,
          revokedAt: null,
        },
      });

      await tx.authAccount.upsert({
        where: {
          provider_providerAccountId: {
            provider: AuthProvider.PHANTOM,
            providerAccountId: walletAddress,
          },
        },
        create: {
          userId,
          provider: AuthProvider.PHANTOM,
          providerAccountId: walletAddress,
          walletAddress,
        },
        update: {
          walletAddress,
        },
      });
    });
  }

  async setUsername(userId: string, rawUsername: string): Promise<User> {
    const username = rawUsername.trim();
    const usernameNormalized = username.toLowerCase();
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
      throw new ConflictException('auth.usernameInvalid');
    }
    const existing = await this.prisma.user.findFirst({
      where: { usernameNormalized, NOT: { id: userId } },
      select: { id: true },
    });
    if (existing) throw new ConflictException('auth.usernameInUse');
    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: { username, usernameNormalized },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('auth.usernameInUse');
      }
      throw error;
    }
  }

  async finishTutorial(
    userId: string,
    tutorialStatus: Extract<TutorialStatus, 'COMPLETED' | 'SKIPPED'>,
  ) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        tutorialStatus,
        tutorialFinishedAt: new Date(),
      },
      select: {
        tutorialStatus: true,
        tutorialFinishedAt: true,
      },
    });
  }

  async phantomWallet(userId: string): Promise<string | null> {
    const account = await this.prisma.authAccount.findFirst({
      where: { userId, provider: AuthProvider.PHANTOM },
      select: { walletAddress: true },
    });
    return account?.walletAddress ?? null;
  }
}
