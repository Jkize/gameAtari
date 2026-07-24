# AGENTS.md

Project memory for Codex when working in this repository.

## Context Maintenance

- Update pertinent `AGENTS.md` and `CLAUDE.md` context files only for material changes that alter architecture, public contracts, schemas, cross-module behavior, important user-visible behavior, operational requirements, or durable implementation rules.
- Do not update context files for small or localized bug fixes, cosmetic changes, routine refactors, tests, formatting, or implementation details that do not change a durable project contract.
- Update the closest module context for material implementation rules and the repository-root context only for cross-cutting contracts or project-wide rules.
- Before finishing a material change, verify that affected context documents describe the implemented behavior and do not preserve obsolete contracts. A context update is not required merely because code changed.

## Project Overview

Tank Arena is a real-time multiplayer top-down tank game.

- Backend: NestJS + TypeScript + Socket.IO. It owns the authoritative simulation.
- Frontend: Angular shell + Phaser + Socket.IO client. It renders server state and sends input only.
- Runtime game state is in memory.
- Rooms, lobby, auth, and persistence already exist. Do not add ranking, tournament, or new persistence systems unless requested.
- Run backend and frontend in separate terminals.

## Frontend UI Versions and Themes

The authenticated frontend currently has two intentionally parallel UI versions. Keep V2 independent from V1 so V1 can be removed after V2 testing without a broad rewrite.

- The active version is selected by `uiVersion: 1 | 2` in the Angular environment files.
- `frontend/src/environments/environment.ts` currently selects V2 for development.
- `frontend/src/environments/environment.production.ts` currently keeps production on V1.
- `frontend/src/app/app.routes.ts` selects the authenticated shell and lobby from that flag.
- V1 uses the existing `AppLayoutComponent` and `LobbyComponent`.
- V2 uses `GameShellV2Component` and `LobbyV2Component`.
- V1 must not display tank personalization.
- Game, tutorial, custom-game, and map-editor routes remain outside the authenticated shell.
- Do not delete or redesign V1 unless explicitly requested. New game-oriented frontend work should target V2 by default.

`ThemeService` supports four theme identifiers:

```ts
'light' | 'dark' | 'light_v2' | 'dark_v2'
```

- Theme toggling stays inside the active UI family.
- The service sets `data-theme` and `data-ui-version` on the root HTML element.
- Stored legacy preferences are normalized into the active UI family.
- V2 shared tokens and reusable visual primitives live in `frontend/src/styles/v2-game-ui.css`, imported by `frontend/src/styles.css`.
- Scope V2 global rules through `[data-ui-version='2']` and the appropriate `[data-theme='light_v2' | 'dark_v2']` selector.
- Keep page-specific structure in component styles, but centralize reusable theme colors, controls, surfaces, borders, and states in the V2 global stylesheet.

Theme direction:

- `dark_v2` is the neon game interface: dark navy surfaces with cyan, green, and magenta accents.
- `light_v2` keeps the warm V1 light palette: cream background, white surfaces, beige borders, dark text, and orange primary actions, while retaining V2's game/HUD geometry.
- In `light_v2`, primary actions such as Enter Battle and Save are orange. Green is reserved for ready, connected, eligible, or other success states.
- In `dark_v2`, the main battle action may remain green.

The repository-root `tank_arena_game_shell.html` is a visual reference supplied by the user. It is not production source and must not introduce fake currencies, rankings, missions, or unsupported backend features.

## V2 Frontend State

The V2 shell lives in `frontend/src/app/layout/game-shell-v2/` and currently includes:

- Top game HUD with brand, token contract display, language control, and user menu.
- Desktop left navigation and a responsive mobile bottom navigation.
- Right-side account, public-statistics, and reward-eligibility panels using existing application data.
- Bottom connection/status presentation.

The V2 lobby lives in `frontend/src/app/pages/lobby/lobby-v2/` and currently includes:

- A command-center/hangar presentation with the player's tank centered in the main panel.
- Public battle and private-room controls backed by the existing matchmaking, reconnect, and room behavior.
- Current tank color swatches and a Customize Tank action that opens the editor modal.
- No invented gameplay or backend data.

Presentation-neutral lobby behavior is shared through `frontend/src/app/pages/lobby/lobby.controller.ts`. Both lobby presentations use this controller so the V1 templates can later be deleted without removing V2's matchmaking behavior.

Navigation metadata is managed by `NavigationService`, including route labels and icons.

## Tank Customization Frontend Contract

Tank customization is currently frontend-only and V2-only.

- The reusable customization feature lives in `frontend/src/app/features/tank-customization/`.
- The tank preview is reusable through `tank-appearance-preview/`.
- The V2 lobby opens the editor as a modal through its Customize Tank action.
- Appearance is active today. Skins and Effects are visible extension points but remain disabled/coming soon.
- The user can select body, turret/cannon, or tracks and change colors through the palette/RGB controls with a live preview.

The public frontend contract is defined in `frontend/src/app/game/contracts/tank-customization.types.ts`:

```ts
{
  version: 1,
  skinId: 'classic',
  colors: {
    body: '#...',
    turret: '#...',
    tracks: '#...'
  }
}
```

`TankCustomizationStore` currently persists this value only in local storage under `tank-arena:tank-customization:v1`, with frontend defaults when no saved value exists. The backend is not synchronized yet.

When backend synchronization is implemented:

- Preserve the versioned contract and validate incoming colors.
- Return the player's customization with the initial join/map payload.
- Do not add customization or full map data to frequent `gameState` snapshots without an explicit networking decision.
- Update backend public types and frontend contracts/rendering in the same change.
- Keep cosmetic choices non-authoritative: they must not affect positions, collision, HP, damage, or match outcomes.

## Core Contract

Preserve the server-authoritative design.

- The client must not send positions, HP, damage, collision results, winners, or map mutations.
- The client may only send input:

```ts
{
  moveX: number;
  moveY: number;
  aimAngle: number;
  shoot: boolean;
  dash?: boolean;
  reload?: boolean;
  shield?: boolean;
}
```

- The server owns movement, bullets, weapons, collisions, power-ups, HP, deaths, obstacle destruction, game status, win/restart behavior, room countdowns, and danger-zone damage.
- Do not reintroduce full `map` data into frequent `gameState` snapshots without an explicit networking decision.
- When changing backend public fields, update frontend types and rendering/input code in the same change.

## Frequent State Contract

Frequent `gameState` payloads are intentionally small:

```ts
{
  status: 'waiting' | 'playing' | 'finished';
  players: PlayerPublicState[];
  bullets: BulletPublicState[];
  powerUps: PowerUpSpawn[];
  impactEvents: BulletImpactPublicState[];
  dangerZone?: DangerZonePublicState;
}
```

Full maps are sent only in `gameJoined` / `watchJoined`. Obstacle damage/destruction is synced through `obstacle:damaged` and `obstacle:destroyed`.

## Redis and Authentication Contract

Redis is required infrastructure for authentication and HTTP coordination, but it is not the authoritative game simulation store.

- `REDIS_URL` is mandatory. Production points it at the external Redis server; local development may point it at the Docker Redis service.
- Keep the local `redis` and `redis-commander` services in `docker/docker-compose.yml` for testing. Configure the backend connection through `backend/.env`; never commit real Redis credentials.
- Keep `ioredis` as the production client. Do not restore `ioredis-mock` or a silent in-memory fallback. Redis connection failures must fail closed and prevent normal backend startup.
- The shared Redis client applies the global `tkgame:` key prefix. Every backend-created Redis key, including throttler keys, auth challenges, room cache, and presence, must begin with that prefix physically.
- HTTP throttling uses Redis through `@nest-lab/throttler-storage-redis`.
- Authentication sessions exist only in Redis under logical key `auth:session:{sessionId}` (physical key `tkgame:auth:session:{sessionId}`). Do not restore the Prisma `AuthSession` model.
- A Redis auth-session record contains only `refreshHash`, `userId`, and `provider`. Never store or log a raw refresh token.
- Access JWTs default to 15 minutes. Refresh sessions default to 604,800 seconds (7 days), with the TTL renewed after a successful rotation.
- Refresh rotation must remain atomic through the Lua operation in `TokensService`: a matching hash is replaced and its TTL renewed; a reused/invalid hash deletes the session.
- Logout revokes a session by deleting its Redis key. Access-token authentication verifies the JWT and requires that session key to still exist.
- Real Redis/Lua behavior is covered by the conditional integration test using `TEST_REDIS_URL`; do not replace that verification with a Redis mock.

## Real-Time Memory and Socket Authentication

Preserve the low-latency local-memory boundary.

- Keep `SocketRateLimiterService`, including `playerInput` limiting, in process memory while the backend is a single instance. Do not add a Redis call per player input.
- Keep rooms, active matches, simulation ticks, players, bullets, collisions, timers, and authoritative map mutations in process memory.
- A connected WebSocket is authenticated during its handshake; JWT expiration alone must not interrupt an already connected match.
- Global reconnect authentication lives in the frontend `SocketManager`, configured by `AuthService`. Every handshake reads the latest access token dynamically.
- `GameScene` may call `socketManager.connect()` without a token; this must never erase the existing/current token.
- Backend handshake failures expose stable codes through `SOCKET_CONNECTION_ERROR_CODES`. Keep the backend and frontend constants synchronized whenever this public contract changes.
- On `ACCESS_TOKEN_EXPIRED`, `AUTH_REQUIRED`, or `AUTH_INVALID`, `SocketManager` performs one shared forced refresh, updates socket authentication, and reconnects. Rate-limit errors must not trigger token refresh.
- Concurrent reconnect errors must share the same refresh promise to avoid reuse detection revoking a valid session.
- After reconnect, the game scene requests `room:getState`; room membership is retained for the 60-second reconnect grace period.
- If refresh fails because the Redis session expired or was revoked, clear frontend authentication and do not enter an infinite reconnect/refresh loop.

## Token Rewards Context

Tank Arena has an SPL token rewards system layered on top of completed matches.

- Rewards are for authenticated registered users only. Local/dev guest-style players may exist for testing, but they are not eligible for production rewards.
- On match completion, backend persists `Match`, `MatchPlayer`, and top-3 `RewardLog` rows idempotently. Match persistence is idempotent by the per-round `roundId`; reward idempotency keys use `MATCH_REWARD:{matchId}:{placement}`.
- `Match.roomId` groups multiple rounds played in the same room and is not unique. Each match snapshots `roomName`, `roomType: PUBLIC | PRIVATE`, and `rewardsEligible`.
- `roomType` and `rewardsEligible` are independent. A future public room may be visible in public history without necessarily being reward-eligible.
- All match-history screens and endpoints require authentication. The global feed/detail expose only `PUBLIC` matches; participant-aware detail may expose a private match only to one of its participants.
- Personal history contains both public and private matches. Private matches keep their gameplay history but do not present reward-disabled/ineligible UI.
- Eligibility is checked at match end, before payment: verified Phantom wallet, configured mint balance of at least 10,000 tokens, and daily reward limit availability.
- Prizes are fixed: 1st = 700, 2nd = 300, 3rd = 100. Prizes are never redistributed.
- Solana/Helius config is centralized in `backend/src/solana`; `NODE_ENV=production` uses mainnet-beta, all other environments use devnet.
- Reward history endpoints live under `/rewards`: personal history, recent public matches, and match detail. Match browsing requires authentication; responses return backend-generated Solscan URLs and paginate at 50 items.
- Frontend routed screens live in `frontend/src/app/pages`; Phaser runtime, rendering, audio, input, and public game contracts live in `frontend/src/app/game`.
- Reusable reward UI lives in `frontend/src/app/features/rewards`; account/wallet linking UI lives in `frontend/src/app/features/account`.

## Private-Room Round Statistics

- Private rooms survive round completion and keep an in-memory room scoreboard until the room is destroyed or the backend restarts.
- Each member accumulates `roundsPlayed`, `roundWins`, `kills`, and `damageDealt`; completed per-round results remain durable in PostgreSQL.
- `room:stateUpdated` carries the accumulated room-member statistics. They do not belong in frequent `gameState` snapshots.
- The private-room roster is ordered by wins, kills, damage, then username. Its compact UI uses `W` for rounds won and `K` for kills, with one accessible help control per column.

## Commands

Backend, from `backend/`:

```bash
npm run dev
npm run build
npm run start
npm test
```

Frontend, from `frontend/`:

```bash
npm start
npm run build
npm test
```

Build both packages when changing shared contracts:

```bash
cd backend && npm run build
cd frontend && npm run build
```

## Development Guidelines

- Prefer small, focused edits in the existing NestJS/Phaser style.
- Avoid broad refactors while gameplay behavior is moving quickly.
- When testing with Playwright, reuse the frontend server that is already active. Never stop or restart a pre-existing frontend/watch process. If no frontend server is active and a temporary one must be started for testing, track its exact PID and only stop that agent-started process.
- Treat obstacle positions as centers everywhere.
- Keep bushes non-blocking for tanks unless explicitly changing game design.
- When adding a mechanic that mutates map state, update backend simulation, public events/state, frontend types, and rendering/HUD together.
- Keep responses concise by default: inspect only relevant files, avoid dumping full files/logs, and summarize changes plus verification.
