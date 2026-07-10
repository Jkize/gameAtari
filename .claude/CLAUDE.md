# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

Tank Arena is a real-time multiplayer browser game.

- Backend: NestJS + TypeScript + Socket.IO. The backend is the authoritative simulation.
- Frontend: Angular shell + Phaser + Socket.IO client. The frontend renders authoritative state and sends input only.
- Runtime game state is in memory.
- Rooms/lobby/auth/persistence exist; avoid adding new persistence, rankings, tournaments, or broad infrastructure unless requested.
- Run backend and frontend in separate terminals.

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

## Authoritative Runtime Contract

The client must not send positions, HP, damage, collision results, winners, or map mutations. It sends input only:

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

The server owns movement, bullets, weapons, collisions, power-ups, HP, deaths, obstacle destruction, game status, win/restart behavior, and room countdowns.

## Current Networking Model

The game loop separates simulation frequency from network frequency.

- Simulation: 60 Hz.
- Player `gameState`: 30 Hz.
- Watcher `gameState`: 15 Hz.
- Client input: 60 Hz.
- Phaser can render 60 FPS, but without interpolation it visually follows the latest 30 Hz authoritative snapshot.

Frequent `gameState` does not include the map:

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

The full map is sent once through `gameJoined` or `watchJoined`:

```ts
gameJoined: { playerId, roomId, map, status }
watchJoined: { watcherId, map, status }
```

The frontend caches the initial map and merges it with realtime snapshots.

Do not put full `map`, `obstacles`, `spawnPoints`, `width`, or `height` back into frequent `gameState` unless explicitly requested.

## Socket.IO Events

Client to server:

- `joinGame`, `watchGame`, `playerInput`, `startGame`, `restartGame`
- `lobby:listRooms`, `lobby:quickPlay`, `lobby:createRoom`, `lobby:joinRoom`, `lobby:leaveRoom`, `room:getState`

Server to client:

- `gameJoined`, `watchJoined`, `gameStarted`, `gameState`, `game:ended`, `playerDisconnected`, `game:error`
- `room:joined`, `room:left`, `room:stateUpdated`, `room:countdownStarted`, `room:countdownUpdated`, `room:countdownCancelled`
- `obstacle:damaged`, `obstacle:destroyed`
- `powerUp:spawned`, `powerUp:collected` still exist as informational events, but current frontend reconciles visible power-ups from `gameState.powerUps`.

Player room: `game:${roomId}:players`.
Watcher room: `game:${roomId}:watchers`.
Lobby room: `lobby`.

## Map, Obstacles, And Power-Ups

- Full `GameMap` is initial/static from the network perspective.
- Obstacle damage/destruction is sent as:

```ts
obstacle:damaged { id, hp, healthRatio }
obstacle:destroyed { id }
```

- These events must be emitted for any weapon/mechanic that mutates obstacles.
- Current code covers normal bullets, grenades, and laser obstacle/bush changes.
- Power-ups stay in frequent `gameState.powerUps` because the array is small.
- In development, initial JSON power-ups are preserved if present and dynamic spawning is enabled.
- In production, initial JSON power-ups are cleared at match start and dynamic spawning is enabled.
- First dynamic spawn delay: 3000 ms.
- Subsequent spawn interval: 15000 ms.
- Current map JSON files mostly contain `"powerUps": []`, so power-ups usually appear from dynamic spawn.

## Danger Zone

Tank Arena has a server-authoritative safe-zone / danger-zone mechanic for match pacing.

- Backend owns center, radius, phase, timing, and out-of-zone damage.
- Frontend only renders `gameState.dangerZone` and HUD warnings; it must not apply damage or move players.
- `gameState.dangerZone` is intentionally small and optional. Do not reintroduce full `map` into frequent snapshots.
- Frequent `dangerZone` payload intentionally includes only `phase`, `centerX`, `centerY`, `radius`, `warningStartsAt`, and `damageStartsAt`.
- No teleporting, forced movement, or exact-point objective is used.
- Center is chosen once per match with `edgeMarginPx = 300`.
- Initial radius is dynamic by map size: farthest map corner from center plus 10 px, so the zone begins just outside any current map.
- Final radius tiers: 220 px for <=4 players, 250 px for <=8, 300 px for <=16.
- After reaching final radius, the zone holds briefly, then enters `sudden_death` and shrinks again to a tiny radius: 40 px for <=4 players, 50 px for <=8, 60 px for <=16.
- Zone damage ignores shield, does not credit kills, but still records damage taken, deaths, destroyed body timing, and elimination order.
- `DEV_GAME_MODE=true` compresses timings for testing: warning at 5s, damage at 10s, final target at 45s.
- Production <=4-player timing: warning at 90s, damage at 120s, final target at 240s; larger tiers are slower.

Important files:

- `backend/src/games/tanks/danger-zone.service.ts`: tier configs, center picking, phase/radius/public state.
- `backend/src/games/tanks/game-loop.service.ts`: zone initialization, tick damage, `gameState` payload.
- `backend/src/games/tanks/game.service.ts`: direct shield-ignoring zone damage helper.
- `frontend/src/app/scenes/game-scene/danger-zone-renderer.ts`: lava-style world renderer.
- `frontend/src/app/scenes/game-scene/game-hud-renderer.ts`: zone warning HUD.

## Development Vs Production Rooms

- `DEV_GAME_MODE=true` enables guest auth and development rooms such as `dev-salatest`.
- Development min players: 1.
- Development countdown: 3 seconds.
- Production min players: 2.
- `DEV_MANUAL_START` exists, but default flow is authoritative countdown, not ENTER manual start.
- Frontend HUD listens to room countdown events and can display `STARTING IN Ns`.

## SPL Token Rewards

Tank Arena has an SPL token reward system for completed matches.

- Rewards are production-oriented. Guest/local testing players can play but are not eligible for production rewards.
- On match completion, backend persists `Match`, `MatchPlayer`, and top-3 `RewardLog` rows idempotently.
- Reward idempotency key format: `MATCH_REWARD:{matchId}:{placement}`. Use placement, not only user id, because top placement is the reward slot.
- Fixed prizes: 1st = 700 tokens, 2nd = 300 tokens, 3rd = 100 tokens. Prizes are never redistributed.
- Eligibility is checked at match end before payment: authenticated user, verified linked Phantom wallet, configured mint balance >= 10,000 tokens, daily limit not exceeded.
- `RewardLog` is both audit/elegibility record and payment lifecycle record. Retry failed recoverable payments on the same row; do not create duplicate rewards.
- `DailyRewardLimit` reserves/sends/releases daily reward amounts. PostgreSQL is the consistency source of truth; Redis is not used for reward idempotency.
- Solana/Helius access is centralized in `backend/src/solana`; network selection is centralized there (`production` => mainnet-beta, otherwise devnet).
- `RewardsModule` owns reward controllers/services and must be in the active Nest module graph. A previous 404 was caused by `RewardsHistoryController` existing but `RewardsModule` not being imported by an active module.
- `GameModule` should import `RewardsModule` instead of manually re-declaring reward providers, to avoid duplicate schedulers/processors.

Reward HTTP API:

- `GET /wallets/me`: authenticated wallet/account status and informational holder check.
- `POST /wallets/phantom/link`: authenticated Phantom linking; verifies signed challenge without changing current login session.
- `POST /account/google/link`: authenticated Google linking; no automatic merge if account is linked elsewhere.
- `GET /rewards/me/history`: authenticated personal history, max 50 per page, cursor pagination.
- `GET /rewards/matches/recent`: public recent matches, max 50 per page, cursor pagination.
- `GET /rewards/matches/:matchId`: public full match detail.
- Backend generates Solscan URLs. Devnet uses `?cluster=devnet`; frontend must not build these URLs from user-controlled values.

Frontend reward UI:

- Lobby notice is non-blocking; Quick Play remains available.
- Use `AuthService.linkPhantom()` for linking. Do not use `loginPhantom()` from the lobby/account popup because it replaces the session.
- Show `Vincular Phantom` only for Google sessions without verified Phantom.
- `frontend/src/app/rewards/` contains histories, status badge, Solscan link, and eligibility notice.
- `frontend/src/app/account/account-settings.component.ts` contains the account linking popup.

## Backend Notes

Important files:

- `backend/src/games/tanks/game.gateway.ts`: Socket.IO gateway, auth/guest mode, game joins/watch.
- `backend/src/rooms/rooms.service.ts`: room membership, countdowns, reconnect, finish/release.
- `backend/src/games/tanks/game-loop.service.ts`: simulation loop, realtime state builder, network broadcast cadence, map delta events.
- `backend/src/games/tanks/game.service.ts`: player lifecycle, input validation, movement, dash, shield, shooting, damage, reset.
- `backend/src/games/tanks/maps/map.service.ts`: JSON map loading and legacy helper map.
- `backend/src/games/tanks/collision.service.ts`: AABB/swept collision and mirror reflection.
- `backend/src/games/tanks/weapons/`: default, power-up, laser, and grenade behavior.
- `backend/src/games/tanks/types/`: backend contracts.

Loop behavior:

- Tick at 60 Hz.
- While `playing`, process power-up spawns, players, bullets, win condition, then broadcast when player/watcher network interval is due.
- Player movement is skipped while the player is firing a laser.
- Bushes and decorations do not block player movement.
- Power-ups are picked up by radius overlap.
- Mirrors reflect bullets.
- Destructible obstacles lose HP and are removed at zero HP.
- Win condition: if more than one player exists and one or zero are alive, status becomes `finished`; loop stops after destroyed bodies fade.

## Frontend Notes

Important files:

- `frontend/src/app/scenes/GameScene.ts`: socket setup, cached map, realtime snapshot merge, render loop.
- `frontend/src/app/scenes/game-scene/`: input, HUD, renderers, effects, state change tracking.
- `frontend/src/app/network/socket-events.ts`: frontend event names; keep aligned with backend.
- `frontend/src/app/types/game-state.types.ts`: frontend copy of public contracts.

Frontend responsibilities:

- Cache map from `gameJoined` / `watchJoined`.
- Reconcile visible power-ups from `gameState.powerUps`.
- Apply obstacle events to cached map.
- Send input at 60 Hz while playing.
- Do not simulate authoritative collisions, HP, damage, deaths, map mutation, or winners.

Rendering notes:

- Obstacles are static render objects keyed by obstacle ID.
- Power-ups use `weapon-${assetId}` textures or tinted fallback.
- HUD shows HP, dash, shield, ammo/reload, active power-up, player count, countdown/status overlays.
- Camera follows an invisible target moved to the local player.

## Verification And Logs

Build both packages when changing shared contracts:

```bash
cd backend && npm run build
cd frontend && npm run build
```

`GameLoopService` has `ENABLE_NET_LOGS`; it should remain `false` by default. When enabled, it measures real payload size using:

```ts
Buffer.byteLength(JSON.stringify(payload), 'utf8')
```

Recent observed payload after removing map from `gameState`: about 0.85 KB to 1.45 KB per snapshot with 2 players on a small map at 30 Hz.

Some existing backend tests may have stale expectations around room min players/countdown/power-up caps; verify whether failures are related before treating them as regressions.

## Development Guidelines

- Preserve the server-authoritative design.
- Prefer small, focused edits in the existing NestJS/Phaser style.
- Treat obstacle positions as centers everywhere.
- Keep bushes non-blocking for tanks unless explicitly changing game design.
- Avoid broad refactors while gameplay behavior is moving quickly.
- Update backend simulation, public contracts/events, frontend types, and rendering/HUD together when adding mechanics.
- Do not reintroduce full map into frequent `gameState` without an explicit networking decision.
