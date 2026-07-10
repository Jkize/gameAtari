# Backend Instructions

Backend for Tank Arena: NestJS + TypeScript + Socket.IO.

## Responsibilities

- The backend is the authoritative simulation.
- It owns player movement, input validation, dash, shield, shooting, bullets, weapons, collisions, power-ups, HP, deaths, obstacle destruction, game status, win/restart behavior, room countdowns, and danger-zone damage.
- Runtime game state is in memory.
- Do not broadcast heavy game snapshots globally.

## Important Files

- `src/games/tanks/game.gateway.ts`: Socket.IO gateway, joins/watching, start/restart, auth/guest mode.
- `src/rooms/rooms.service.ts`: lobby/room membership, countdowns, reconnect, finish/release.
- `src/games/tanks/game-loop.service.ts`: authoritative simulation loop, realtime state builder, broadcast cadence, map delta events.
- `src/games/tanks/game.service.ts`: player lifecycle, input validation, movement, dash, shooting, damage, reset.
- `src/games/tanks/maps/map.service.ts`: JSON map loading and legacy map helpers.
- `src/games/tanks/collision.service.ts`: player/obstacle, bullet/obstacle, bullet/player, mirror reflection.
- `src/games/tanks/weapons/`: default weapon, power-up weapons, laser and grenade logic.
- `src/games/tanks/danger-zone.service.ts`: danger-zone config, phase/radius calculation, public state.
- `src/games/tanks/types/`: server-side contracts.
- `src/matches/`: persists completed match results and participants.
- `src/rewards/`: reward eligibility, reward logs, payout processor, history API, daily reward limits.
- `src/solana/`: Helius/Solana config and gateway; use this abstraction instead of direct RPC calls elsewhere.
- `src/auth/wallets.controller.ts` and `src/auth/account.controller.ts`: authenticated account linking and wallet status endpoints.

## Runtime Rules

- Simulation tick: 60 Hz.
- Player snapshots: 30 Hz.
- Watcher snapshots: 15 Hz.
- Frequent `gameState` must not include full map data.
- Full maps are sent only through `gameJoined` / `watchJoined`.
- Obstacle damage/destruction is synchronized via `obstacle:damaged` and `obstacle:destroyed`.
- Power-ups are kept as a small JSON array in `gameState.powerUps`.
- Danger-zone state is a small optional `gameState.dangerZone` payload.

## Gameplay Notes

- Movement input is clamped to `[-1, 1]` and normalized so diagonal movement is not faster.
- Dash is server-authoritative: 4x speed for 300 ms, 5000 ms cooldown, only while moving.
- Shield is server-authoritative.
- Bushes and decorations do not block player movement.
- Mirrors reflect bullets; normal solid obstacles absorb bullets; destructible obstacles lose HP.
- Zone damage ignores shield and does not credit kills to another player.
- Win condition: if more than one player exists and one or zero are alive, status becomes `finished`.

## Environment Behavior

- `DEV_GAME_MODE=true` uses guest auth and development rooms such as `dev-salatest`.
- Development min players is 1 and countdown is 3 seconds.
- Production min players is currently 2.
- `DEV_MANUAL_START` exists, but by default the backend uses authoritative room countdown.

## Rewards And Wallets

- Rewards are production-oriented and require a registered authenticated user. Guest/local testing players may complete matches but must not receive production rewards.
- Completed matches are persisted idempotently by room id. Players are unique per match; reward logs are unique by `(matchId, placement)` and `idempotencyKey`.
- Top-3 reward logs must exist for history/audit even when not eligible. Do not redistribute prizes to lower placements.
- Eligibility rules: verified Phantom wallet, configured `MINT` token balance >= 10,000 at match end, and daily limit not exceeded. Daily reward accounting uses America/Bogota.
- `RewardLog` represents both eligibility and payment lifecycle. Do not create a second row to retry a failed reward; retry the same row.
- `DailyRewardLimit` is the source of truth for daily reservations. Use PostgreSQL atomic updates; do not rely on Redis for reward idempotency.
- `RewardsModule` owns reward controllers and services. Keep it imported through active Nest modules so routes are registered. A previous 404 happened because `RewardsHistoryController` existed but `RewardsModule` was not in the active module graph.
- `GameModule` should import `RewardsModule` instead of re-declaring rewards providers manually; avoid duplicate scheduler/processor instances.

## Reward HTTP API

- `GET /wallets/me`: authenticated account/wallet/holder status for lobby notice and account popup.
- `POST /wallets/phantom/link`: authenticated Phantom linking; verifies SIWS challenge without changing the current session.
- `POST /account/google/link`: authenticated Google linking; no automatic account merge if the provider is already linked elsewhere.
- `GET /rewards/me/history`: authenticated personal match history, paginated by cursor, max 50.
- `GET /rewards/matches/recent`: public recent matches, paginated by cursor, max 50.
- `GET /rewards/matches/:matchId`: public match detail with full placements and reward summaries.
- Solscan URLs are generated by the backend only: devnet appends `?cluster=devnet`, mainnet uses the normal tx URL.

## Commands

Run from `backend/`:

```bash
npm run dev
npm run build
npm run start
npm test
```

Some existing backend tests may have stale expectations around room min players/countdown/power-up caps; verify whether failures are related to the current change before treating them as regressions.
