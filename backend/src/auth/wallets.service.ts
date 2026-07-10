import { Injectable } from '@nestjs/common';
import { AuthProvider } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  MINIMUM_HOLDER_BALANCE_TOKENS,
} from '../rewards/rewards.config';
import { rawToTokenDecimalString, tokensToRaw } from '../rewards/rewards.types';
import { SolanaConfigService } from '../solana/solana-config.service';
import { SolanaGateway } from '../solana/solana.types';

export type HolderStatus = 'unknown' | 'eligible' | 'insufficient' | 'unavailable';

export interface AccountWalletStatus {
  currentProvider: AuthProvider;
  phantom: {
    linked: boolean;
    verified: boolean;
    addressPreview?: string;
  };
  google: {
    linked: boolean;
  };
  holder: {
    status: HolderStatus;
    requiredTokens: number;
    balance?: string;
    checkedAt?: string;
    message: string;
  };
}

@Injectable()
export class WalletsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly solanaConfig: SolanaConfigService,
    private readonly solana: SolanaGateway,
  ) {}

  async statusForUser(userId: string, currentProvider: AuthProvider): Promise<AccountWalletStatus> {
    const [accounts, wallet] = await Promise.all([
      this.prisma.authAccount.findMany({
        where: { userId },
        select: { provider: true },
      }),
      this.prisma.wallet.findFirst({
        where: {
          userId,
          provider: AuthProvider.PHANTOM,
          revokedAt: null,
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const phantom = {
      linked: Boolean(wallet),
      verified: Boolean(wallet?.verifiedAt),
      addressPreview: wallet ? this.preview(wallet.address) : undefined,
    };

    return {
      currentProvider,
      phantom,
      google: {
        linked: accounts.some(account => account.provider === AuthProvider.GOOGLE),
      },
      holder: await this.holderStatus(wallet?.address ?? null, phantom.verified),
    };
  }

  private async holderStatus(walletAddress: string | null, verified: boolean): Promise<AccountWalletStatus['holder']> {
    if (!walletAddress || !verified) {
      return {
        status: 'unknown',
        requiredTokens: MINIMUM_HOLDER_BALANCE_TOKENS,
        message: 'Vincula y verifica Phantom para consultar tus tokens.',
      };
    }

    if (!this.solanaConfig.rewardsEnabled() || !this.solanaConfig.mint()) {
      return {
        status: 'unavailable',
        requiredTokens: MINIMUM_HOLDER_BALANCE_TOKENS,
        message: 'El chequeo de tokens no esta disponible ahora.',
      };
    }

    try {
      const balance = await this.solana.getTokenBalance(walletAddress, this.solanaConfig.mint());
      const requiredRaw = tokensToRaw(MINIMUM_HOLDER_BALANCE_TOKENS, balance.decimals);
      const balanceText = rawToTokenDecimalString(balance.amountRaw, balance.decimals);
      const eligible = balance.amountRaw >= requiredRaw;
      return {
        status: eligible ? 'eligible' : 'insufficient',
        requiredTokens: MINIMUM_HOLDER_BALANCE_TOKENS,
        balance: balanceText,
        checkedAt: new Date().toISOString(),
        message: eligible
          ? 'Tienes 10.000+ tokens ahora.'
          : 'Ahora tienes menos de 10.000 tokens.',
      };
    } catch {
      return {
        status: 'unavailable',
        requiredTokens: MINIMUM_HOLDER_BALANCE_TOKENS,
        message: 'No pudimos consultar tu saldo ahora.',
      };
    }
  }

  private preview(address: string): string {
    if (address.length <= 10) return address;
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  }
}
