# AGENTS.md

Project memory for Codex when working in this repository.

## Project Overview

Tank Arena is a real-time multiplayer top-down tank game.

- Backend: NestJS + TypeScript + Socket.IO. It owns the authoritative simulation.
- Frontend: Angular shell + Phaser + Socket.IO client. It renders server state and sends input only.
- Runtime game state is in memory.
- Rooms, lobby, auth, and persistence already exist. Do not add ranking, tournament, or new persistence systems unless requested.
- Run backend and frontend in separate terminals.

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
- On match completion, backend persists `Match`, `MatchPlayer`, and top-3 `RewardLog` rows idempotently. Reward idempotency keys use `MATCH_REWARD:{matchId}:{placement}`.
- Eligibility is checked at match end, before payment: verified Phantom wallet, configured mint balance of at least 10,000 tokens, and daily reward limit availability.
- Prizes are fixed: 1st = 700, 2nd = 300, 3rd = 100. Prizes are never redistributed.
- Solana/Helius config is centralized in `backend/src/solana`; `NODE_ENV=production` uses mainnet-beta, all other environments use devnet.
- Reward history endpoints live under `/rewards`: personal history, recent public matches, and match detail. They return backend-generated Solscan URLs and paginate at 50 items.
- Frontend reward UI lives in `frontend/src/app/rewards`; account/wallet linking UI lives in `frontend/src/app/account`.

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
- Treat obstacle positions as centers everywhere.
- Keep bushes non-blocking for tanks unless explicitly changing game design.
- When adding a mechanic that mutates map state, update backend simulation, public events/state, frontend types, and rendering/HUD together.
- Keep responses concise by default: inspect only relevant files, avoid dumping full files/logs, and summarize changes plus verification.
