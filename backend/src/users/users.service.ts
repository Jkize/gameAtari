import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthProvider, Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface GoogleIdentity {
  subject: string;
  email: string;
  avatarUrl?: string;
}

const LIST_PAGE_SIZE = 50;

interface UserListCursor {
  createdAt: string;
  id: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Admin listing of users, newest registrations first. Cursor-paginated by `(createdAt DESC, id DESC)`, capped at `LIST_PAGE_SIZE` rows per page. */
  async list(cursor?: string | null) {
    const rows = await this.prisma.user.findMany({
      where: this.listCursorWhere(cursor),
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
      take: LIST_PAGE_SIZE + 1,
    });
    const items = rows.slice(0, LIST_PAGE_SIZE);
    return {
      items: items.map(({ accounts, ...user }) => ({
        ...user,
        createdAt: user.createdAt.toISOString(),
        providers: [...new Set(accounts.map(account => account.provider))],
      })),
      nextCursor: this.listNextCursor(items, rows.length > LIST_PAGE_SIZE),
    };
  }

  /** Translates an opaque page cursor into a Prisma `WHERE` clause that continues strictly after that cursor's `(createdAt, id)`. */
  private listCursorWhere(cursor?: string | null): Prisma.UserWhereInput | undefined {
    const decoded = this.decodeListCursor(cursor);
    if (!decoded) return undefined;
    return {
      OR: [
        { createdAt: { lt: new Date(decoded.createdAt) } },
        {
          createdAt: new Date(decoded.createdAt),
          id: { lt: decoded.id },
        },
      ],
    };
  }

  /** Builds the opaque base64url cursor for the next page from the last item on the current page, or `null` if there is no next page. */
  private listNextCursor(items: { id: string; createdAt: Date }[], hasNext: boolean): string | null {
    if (!hasNext || !items.length) return null;
    const last = items[items.length - 1];
    return Buffer.from(JSON.stringify({
      createdAt: last.createdAt.toISOString(),
      id: last.id,
    } satisfies UserListCursor)).toString('base64url');
  }

  /** Parses and validates an opaque cursor, returning `null` for missing/malformed/invalid input rather than throwing. */
  private decodeListCursor(cursor?: string | null): UserListCursor | null {
    if (!cursor) return null;
    try {
      const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Partial<UserListCursor>;
      if (!parsed.id || !parsed.createdAt || Number.isNaN(new Date(parsed.createdAt).getTime())) return null;
      return { id: parsed.id, createdAt: parsed.createdAt };
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
        data: { avatarUrl: identity.avatarUrl },
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
      const user = await tx.user.create({ data: {} });
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

  async phantomWallet(userId: string): Promise<string | null> {
    const account = await this.prisma.authAccount.findFirst({
      where: { userId, provider: AuthProvider.PHANTOM },
      select: { walletAddress: true },
    });
    return account?.walletAddress ?? null;
  }
}
