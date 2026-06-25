import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthProvider, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface GoogleIdentity {
  subject: string;
  email: string;
  avatarUrl?: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

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
    if (account) return account.user;

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
      return user;
    });
  }

  async setUsername(userId: string, rawUsername: string): Promise<User> {
    const username = rawUsername.trim();
    const usernameNormalized = username.toLowerCase();
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
      throw new ConflictException('Username must be 3-20 characters using letters, numbers or underscore');
    }
    const existing = await this.prisma.user.findFirst({
      where: { usernameNormalized, NOT: { id: userId } },
      select: { id: true },
    });
    if (existing) throw new ConflictException('Username is already in use');
    return this.prisma.user.update({
      where: { id: userId },
      data: { username, usernameNormalized },
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
