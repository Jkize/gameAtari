import { BadRequestException, Controller, Get, Header, Param, Query } from '@nestjs/common';
import { seconds, Throttle } from '@nestjs/throttler';
import { RequestUser } from '../common/request-user.decorator';
import { AuthenticatedUser } from '../common/auth.types';
import { Public } from '../auth/decorators/public.decorator';
import { SolanaConfigService } from '../solana/solana-config.service';
import { RewardsHistoryService } from './rewards-history.service';
import {
  REWARD_PHASE_ONE_CONFIG,
  REWARD_PHASE_ONE_SCHEDULE,
} from './rewards.config';

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

  /** Public proportional reward schedule used by clients for live prize projections. */
  @Public()
  @Get('config')
  @Throttle({ default: { limit: 120, ttl: seconds(60) } })
  config() {
    return {
      enabled: this.solanaConfig.rewardsEnabled(),
      phase: REWARD_PHASE_ONE_CONFIG.phase,
      minimumPlayers: REWARD_PHASE_ONE_CONFIG.minimumPlayers,
      maximumPlayers: REWARD_PHASE_ONE_CONFIG.maximumPlayers,
      tiers: REWARD_PHASE_ONE_CONFIG.tiers.map(tier => ({
        minimumPlayers: tier.minimumPlayers,
        maximumPlayers: tier.maximumPlayers,
      })),
      schedule: REWARD_PHASE_ONE_SCHEDULE,
    };
  }

  /** Authenticated caller's personal match/reward history, including user-facing ineligibility reasons. */
  @Get('me/history')
  @Throttle({ default: { limit: 60, ttl: seconds(60) } })
  personalHistory(@RequestUser() auth: AuthenticatedUser, @Query('cursor') cursor?: string) {
    this.assertValidCursor(cursor);
    return this.history.personalHistory(auth.userId, cursor);
  }

  /** Authenticated match detail. Private matches are visible only to their participants. */
  @Get('me/matches/:matchId')
  @Throttle({ default: { limit: 120, ttl: seconds(60) } })
  personalMatchDetail(
    @RequestUser() auth: AuthenticatedUser,
    @Param('matchId') matchId: string,
  ) {
    this.assertValidMatchId(matchId);
    return this.history.personalMatchDetail(matchId, auth.userId);
  }

  /** Authenticated feed of recent public matches with podium/reward info. */
  @Get('matches/recent')
  @Header('Cache-Control', 'private, no-store')
  @Throttle({ default: { limit: 60, ttl: seconds(60) } })
  recentMatches(@Query('cursor') cursor?: string) {
    this.assertValidCursor(cursor);
    return this.history.recentMatches(cursor);
  }

  /** Authenticated detail view of a public match's players and rewards. */
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
