import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class RewardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly config: ConfigService,
  ) {}

  async registerPending(matchId: string, winnerUserId: string): Promise<void> {
    const walletAddress = await this.users.phantomWallet(winnerUserId);
    if (!walletAddress) return;
    await this.prisma.rewardLog.upsert({
      where: { matchId_userId: { matchId, userId: winnerUserId } },
      create: {
        matchId,
        userId: winnerUserId,
        walletAddress,
        amount: this.config.get<number>('REWARD_AMOUNT', 1),
        asset: this.config.get<string>('REWARD_ASSET', 'TA_BETA'),
      },
      update: {},
    });
  }
}
