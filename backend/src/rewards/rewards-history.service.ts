import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RewardIneligibilityReason, RewardStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SolanaConfigService } from '../solana/solana-config.service';

const PAGE_SIZE = 50;

interface HistoryCursor {
  endedAt: string;
  id: string;
}

/** Reward info attached to a match/player entry. Personal endpoints may include user-facing ineligibility reasons. */
export interface RewardSummary {
  placement: number;
  potentialAmount: number;
  amount: number;
  eligible: boolean;
  status: RewardStatus;
  ineligibilityReason?: RewardIneligibilityReason | null;
  solscanUrl?: string | null;
}

export type PublicRewardSummary = Omit<RewardSummary, 'ineligibilityReason'>;

/** Read model over `Match`/`RewardLog` for the rewards history API. Backend-generated `solscanUrl`s; the frontend only renders them. */
@Injectable()
export class RewardsHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly solanaConfig: SolanaConfigService,
  ) {}

  /** Cursor-paginated match history for one authenticated user, newest match first. */
  async personalHistory(userId: string, cursor?: string | null) {
    const page = await this.prisma.matchPlayer.findMany({
      where: {
        userId,
        match: this.cursorWhere(cursor),
      },
      include: {
        match: {
          include: {
            players: { select: { id: true } },
          },
        },
      },
      orderBy: [
        { match: { endedAt: 'desc' } },
        { match: { id: 'desc' } },
      ],
      take: PAGE_SIZE + 1,
    });

    const items = page.slice(0, PAGE_SIZE);
    const rewards = await this.rewardsForMatches(items.map(item => item.matchId), { includeIneligibilityReason: true });
    const nextCursor = this.nextCursor(items, page.length > PAGE_SIZE, item => ({
      id: item.match.id,
      endedAt: item.match.endedAt,
    }));

    return {
      items: items.map(item => ({
        matchId: item.matchId,
        playedAt: item.match.endedAt.toISOString(),
        mapName: item.match.mapName,
        placement: item.placement,
        playerCount: item.match.players.length,
        kills: item.kills,
        damageDealt: item.damageDealt,
        winner: item.winner,
        reward: rewards.get(`${item.matchId}:${item.placement}`) ?? null,
      })),
      nextCursor,
    };
  }

  /** Cursor-paginated public feed of recent matches with each match's top-3 podium and reward info. */
  async recentMatches(cursor?: string | null) {
    const matches = await this.prisma.match.findMany({
      where: this.cursorWhere(cursor),
      include: {
        _count: {
          select: { players: true },
        },
        players: {
          where: { placement: { in: [1, 2, 3] } },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                avatarUrl: true,
              },
            },
          },
          orderBy: { placement: 'asc' },
        },
      },
      orderBy: [
        { endedAt: 'desc' },
        { id: 'desc' },
      ],
      take: PAGE_SIZE + 1,
    });

    const items = matches.slice(0, PAGE_SIZE);
    const rewards = await this.rewardsForMatches(items.map(item => item.id), { includeIneligibilityReason: false });
    const nextCursor = this.nextCursor(items, matches.length > PAGE_SIZE, item => ({
      id: item.id,
      endedAt: item.endedAt,
    }));

    return {
      items: items.map(match => ({
        matchId: match.id,
        playedAt: match.endedAt.toISOString(),
        mapName: match.mapName,
        playerCount: match._count.players,
        podium: match.players.map(player => ({
          userId: player.userId,
          username: player.user?.username ?? null,
          avatarUrl: player.user?.avatarUrl ?? null,
          placement: player.placement,
          reward: rewards.get(`${match.id}:${player.placement}`) ?? null,
        })),
      })),
      nextCursor,
    };
  }

  /** Full public detail for a single match: every player, placement and reward info. Throws `NotFoundException` if the match doesn't exist. */
  async matchDetail(matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        players: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                avatarUrl: true,
              },
            },
          },
          orderBy: { placement: 'asc' },
        },
      },
    });
    if (!match) throw new NotFoundException('Match not found');

    const rewards = await this.rewardsForMatches([match.id], { includeIneligibilityReason: false });
    return {
      matchId: match.id,
      playedAt: match.endedAt.toISOString(),
      mapName: match.mapName,
      playerCount: match.players.length,
      players: match.players.map(player => ({
        userId: player.userId,
        username: player.user?.username ?? null,
        avatarUrl: player.user?.avatarUrl ?? null,
        placement: player.placement,
        kills: player.kills,
        damageDealt: player.damageDealt,
        winner: player.winner,
        reward: rewards.get(`${match.id}:${player.placement}`) ?? null,
      })),
    };
  }

  /** Batch-loads reward rows for the given matches into a `matchId:placement` -> summary lookup. */
  private async rewardsForMatches(
    matchIds: string[],
    options: { includeIneligibilityReason: true },
  ): Promise<Map<string, RewardSummary>>;
  private async rewardsForMatches(
    matchIds: string[],
    options: { includeIneligibilityReason: false },
  ): Promise<Map<string, PublicRewardSummary>>;
  private async rewardsForMatches(
    matchIds: string[],
    options: { includeIneligibilityReason: boolean },
  ): Promise<Map<string, RewardSummary | PublicRewardSummary>> {
    if (!matchIds.length) return new Map();
    const rewards = await this.prisma.rewardLog.findMany({
      where: { matchId: { in: matchIds } },
      orderBy: { placement: 'asc' },
    });
    return new Map(rewards.map(reward => {
      const summary: RewardSummary = {
        placement: reward.placement,
        potentialAmount: this.decimalToNumber(reward.potentialAmount),
        amount: this.decimalToNumber(reward.amount),
        eligible: reward.eligible,
        status: reward.status,
        ineligibilityReason: reward.ineligibilityReason,
        solscanUrl: this.solscanUrl(reward.transactionSignature),
      };
      if (!options.includeIneligibilityReason) delete summary.ineligibilityReason;
      return [`${reward.matchId}:${reward.placement}`, summary];
    }));
  }

  /** Translates an opaque page cursor into a Prisma `WHERE` clause that continues strictly after that cursor's `(endedAt, id)`. */
  private cursorWhere(cursor?: string | null): Prisma.MatchWhereInput | undefined {
    const decoded = this.decodeCursor(cursor);
    if (!decoded) return undefined;
    return {
      OR: [
        { endedAt: { lt: new Date(decoded.endedAt) } },
        {
          endedAt: new Date(decoded.endedAt),
          id: { lt: decoded.id },
        },
      ],
    };
  }

  /** Builds the opaque base64url cursor for the next page from the last item on the current page, or `null` if there is no next page. */
  private nextCursor<T>(
    items: T[],
    hasNext: boolean,
    select: (item: T) => { id: string; endedAt: Date },
  ): string | null {
    if (!hasNext || !items.length) return null;
    const last = select(items[items.length - 1]);
    return Buffer.from(JSON.stringify({
      endedAt: last.endedAt.toISOString(),
      id: last.id,
    } satisfies HistoryCursor)).toString('base64url');
  }

  /** Parses and validates an opaque cursor, returning `null` for missing/malformed/invalid input rather than throwing. */
  private decodeCursor(cursor?: string | null): HistoryCursor | null {
    if (!cursor) return null;
    try {
      const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Partial<HistoryCursor>;
      if (!parsed.id || !parsed.endedAt || Number.isNaN(new Date(parsed.endedAt).getTime())) return null;
      return { id: parsed.id, endedAt: parsed.endedAt };
    } catch {
      return null;
    }
  }

  /** Builds a Solscan explorer URL for a transaction signature, appending the devnet cluster query param outside mainnet. */
  private solscanUrl(signature: string | null): string | null {
    if (!signature) return null;
    const base = `https://solscan.io/tx/${encodeURIComponent(signature)}`;
    return this.solanaConfig.network() === 'devnet' ? `${base}?cluster=devnet` : base;
  }

  /** Converts a Prisma `Decimal` token amount into a plain `number` for API responses. */
  private decimalToNumber(value: Prisma.Decimal): number {
    return Number(value.toString());
  }
}
