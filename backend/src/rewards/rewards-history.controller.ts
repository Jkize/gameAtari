import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { seconds, Throttle } from '@nestjs/throttler';
import { RequestUser } from '../common/request-user.decorator';
import { AuthenticatedUser } from '../common/auth.types';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { SolanaConfigService } from '../solana/solana-config.service';
import { RewardsHistoryService } from './rewards-history.service';
import { REWARD_AMOUNTS_BY_PLACEMENT } from './rewards.config';

const MAX_CURSOR_LENGTH = 512;
const CURSOR_PATTERN = /^[A-Za-z0-9_-]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Read-only reward history endpoints. Cursor-paginated, capped at 50 rows per page (see `PAGE_SIZE` in `RewardsHistoryService`). */
@Controller('rewards')
export class RewardsHistoryController {
  constructor(
    private readonly history: RewardsHistoryService,
    private readonly solanaConfig: SolanaConfigService,
  ) {}

  /** Public reward values used by clients when presenting the current prize podium. */
  @Get('config')
  @Throttle({ default: { limit: 120, ttl: seconds(60) } })
  config() {
    return {
      enabled: this.solanaConfig.rewardsEnabled(),
      prizes: Object.entries(REWARD_AMOUNTS_BY_PLACEMENT).map(([placement, amount]) => ({
        placement: Number(placement),
        amount,
      })),
    };
  }

  /** Authenticated caller's personal match/reward history, including user-facing ineligibility reasons. */
  @Get('me/history')
  @UseGuards(AccessTokenGuard)
  @Throttle({ default: { limit: 60, ttl: seconds(60) } })
  personalHistory(@RequestUser() auth: AuthenticatedUser, @Query('cursor') cursor?: string) {
    this.assertValidCursor(cursor);
    return this.history.personalHistory(auth.userId, cursor);
  }

  /** Public feed of recent matches with podium/reward info. Unauthenticated. */
  @Get('matches/recent')
  @Throttle({ default: { limit: 60, ttl: seconds(60) } })
  recentMatches(@Query('cursor') cursor?: string) {
    this.assertValidCursor(cursor);
    return this.history.recentMatches(cursor);
  }

  /** Public detail view of a single match's players and rewards. Unauthenticated. */
  @Get('matches/:matchId')
  @Throttle({ default: { limit: 120, ttl: seconds(60) } })
  matchDetail(@Param('matchId') matchId: string) {
    this.assertValidMatchId(matchId);
    return this.history.matchDetail(matchId);
  }

  private assertValidCursor(cursor?: string): void {
    if (cursor == null || cursor === '') return;
    if (cursor.length > MAX_CURSOR_LENGTH || !CURSOR_PATTERN.test(cursor)) {
      throw new BadRequestException('Invalid history cursor');
    }
  }

  private assertValidMatchId(matchId: string): void {
    if (!UUID_PATTERN.test(matchId)) throw new BadRequestException('Invalid match id');
  }
}
