# Backend

NestJS backend module map, wiring conventions, and persistence notes for Tank Arena.

## Module Map

- `AppModule` imports: `ConfigModule`, `DevelopmentSettingsModule`, `PrismaModule`, `RedisModule`, `ThrottlerRedisModule`, `AuthModule`, `HealthModule`, `GameModule`, `StatsModule`, `SettingsModule`, `UsersAdminModule`.
- `AuthModule` imports: `UsersModule`, `SolanaModule`.
- `GameModule` imports: `AuthModule`, `UsersModule`, `RewardsModule`, `RuntimeModule`.
- `RewardsModule` imports: `AuthModule`, `SolanaModule`, `RuntimeModule`.
- `UsersAdminModule` imports: `UsersModule`.
- Thin infra modules with no dedicated file, one line each: `stats/` (match/session stats endpoints), `health/` (health check endpoint), `settings/` (runtime settings endpoint), `throttler/` (Redis-backed rate limiting), `redis/` (Redis client provider), `prisma/` (Prisma client provider), `config/` (env validation schema), `common/` (shared decorators/guards/pipes).

## Nest Wiring Convention

A module that owns providers should be imported by consumers, not have its providers manually re-declared elsewhere. This is stated as a doc comment in `backend/src/rewards/rewards.module.ts`.

## Known Inconsistency

`backend/src/matches/matches.module.ts` (`MatchesModule`) declares `MatchesService` and `MatchResultsRepository`, but `MatchesModule` is never imported into `AppModule`. `GameModule` instead re-declares `MatchesService` and `MatchResultsRepository` directly as its own providers (`backend/src/games/tanks/game.module.ts` around lines 15-16 and 40-41). This is the same anti-pattern the `RewardsModule` doc comment warns against, just not fixed there. Do not assume editing `MatchesModule` affects the running app — verify wiring first.

## Matches & Persistence

`MatchesService.persist()` (`backend/src/matches/matches.service.ts`) runs at match end: upserts `Match`/`MatchPlayer` via `MatchResultsRepository` inside a Prisma transaction, computes placement from `eliminationOrder` plus the last survivor, and hands placements 1-3 to `RewardsService` (see `backend/src/rewards/CLAUDE.md`). Guest (non-UUID) player IDs are persisted with `userId: null`.

- Persistence idempotency uses the unique per-round `roundId`, not `roomId`.
- `roomId` is indexed but non-unique so one private room can own multiple durable rounds.
- Each match snapshots `roomName`, `roomType: PUBLIC | PRIVATE`, and `rewardsEligible`.
- `roomType` controls history visibility; `rewardsEligible` controls reward processing/presentation. Do not derive one from the other.
- All history/detail endpoints require authentication. Global history excludes private matches; participant-aware detail allows public matches plus private matches where the caller participated.

## Commands

From `backend/`:

```bash
npm run dev
npm run build
npm run start
npm test
```

## Verification

Some existing backend tests may have stale expectations around room min players/countdown/power-up caps; verify whether failures are actually related to a change before treating them as regressions.
