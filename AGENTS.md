# AGENTS.md

Project memory for Codex when working in this repository.

## Project Overview

Tank Arena is a real-time multiplayer top-down tank game.

- Backend: NestJS + TypeScript + Socket.IO. It is the authoritative simulation.
- Frontend: Angular shell + Phaser + Socket.IO client. It renders server state and sends input only.
- Runtime game state is in memory.
- Rooms/lobby/auth/persistence exist in the backend now; do not add new persistence/ranking/tournament systems unless requested.
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

## Runtime Contract

The client must not send positions, HP, damage, collision results, winners, or map mutations. It only sends input:

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

The server owns player movement, bullets, weapons, collisions, power-ups, HP, deaths, obstacle destruction, game status, win/restart behavior, and room countdowns.

## Socket.IO Events

Client to server:

- Lobby/room: `lobby:listRooms`, `lobby:quickPlay`, `lobby:createRoom`, `lobby:joinRoom`, `lobby:leaveRoom`, `room:getState`
- Game: `joinGame`, `watchGame`, `playerInput`, `startGame`, `restartGame`

Server to client:

- Lobby/room: `lobby:roomsUpdated`, `room:joined`, `room:left`, `room:stateUpdated`, `room:countdownStarted`, `room:countdownUpdated`, `room:countdownCancelled`
- Game init/events: `gameJoined`, `watchJoined`, `gameStarted`, `game:ended`, `playerDisconnected`, `game:error`
- Realtime: `gameState`
- Map deltas/events: `obstacle:damaged`, `obstacle:destroyed`
- Informational power-up events still exist: `powerUp:spawned`, `powerUp:collected`, but the current frontend primarily reconciles power-ups from `gameState.powerUps`.

Rooms:

- Players are in `game:${roomId}:players`.
- Watchers are in `game:${roomId}:watchers`.
- Lobby users are in `lobby`.
- Do not broadcast heavy game snapshots globally.

## Current Networking Model

`GameLoopService` separates simulation from network broadcast.

- Server simulation tick: 60 Hz (`TICK_INTERVAL = 1000 / 60`).
- Player snapshots: 30 Hz (`PLAYER_BROADCAST_INTERVAL = 1000 / 30`).
- Watcher snapshots: 15 Hz (`WATCHER_BROADCAST_INTERVAL = 1000 / 15`).
- Client input is still sent at 60 Hz.
- Phaser may render at 60 FPS, but without interpolation it displays the latest 30 Hz authoritative snapshot.

Frequent `gameState` no longer includes the full map.

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

Initial join/watch messages include the full map once:

```ts
gameJoined: {
  playerId: string;
  roomId: string;
  map: GameMap;
  status: GameStatus;
}

watchJoined: {
  watcherId: string;
  map: GameMap;
  status: GameStatus;
}
```

The frontend caches this map and merges it with each realtime snapshot:

```ts
this.currentMap.powerUps = state.powerUps;
this.gameState = { ...state, map: this.currentMap };
```

## Map And Obstacle Sync

The map and obstacles are static in the frequent network path.

- Full `GameMap` is sent only through `gameJoined` / `watchJoined`.
- `gameState` includes only `powerUps`, not `map`, `obstacles`, `spawnPoints`, `width`, or `height`.
- Obstacle damage/destruction is synchronized via events:

```ts
obstacle:damaged { id, hp, healthRatio }
obstacle:destroyed { id }
```

These events are emitted for normal bullets, grenades, and laser/bush or laser/destructible obstacle changes. Keep this invariant if adding weapons that mutate obstacles.

Obstacle coordinates are center positions everywhere.

## Power-Ups

- Power-ups are kept as a small JSON array in frequent `gameState.powerUps`.
- In development, initial JSON power-ups are preserved if present and dynamic spawning is enabled.
- In production, initial JSON power-ups are cleared at match start, then dynamic spawning is enabled.
- First dynamic spawn delay is 3000 ms.
- Subsequent dynamic spawn interval is 15000 ms.
- Current map JSON files mostly have `"powerUps": []`, so visible power-ups usually come from dynamic spawn.

## Danger Zone

Tank Arena has a server-authoritative safe-zone / danger-zone mechanic to control match duration.

- The backend owns danger-zone center, radius, phase, timing, and out-of-zone damage.
- The frontend only renders the zone and HUD warnings; it must not calculate or apply zone damage.
- The zone is included as a small optional `gameState.dangerZone` payload; do not add full map data to frequent snapshots for this.
- Frequent `dangerZone` payload intentionally includes only `phase`, `centerX`, `centerY`, `radius`, `warningStartsAt`, and `damageStartsAt`.
- No teleporting, forced movement, or exact-point objective is used. Players move naturally; out-of-zone players take server damage.
- The center is chosen once per match using `edgeMarginPx = 300`, so the center is never too close to map edges.
- The initial radius is dynamic per map: it covers the farthest map corner from the chosen center plus 10 px, so the circle starts just outside the current map regardless of map size.
- The final radius depends on player-count tier: 220 px for <=4 players, 250 px for <=8, 300 px for <=16.
- After reaching final radius, the zone holds briefly, then enters `sudden_death` and shrinks again to a tiny radius: 40 px for <=4 players, 50 px for <=8, 60 px for <=16.
- Zone damage ignores shield and does not credit kills to another player, but still records `damageTaken`, death, destroyed body timing, and elimination order.
- In `DEV_GAME_MODE=true`, zone timings are compressed for testing: warning at 5s, damage at 10s, target/final at 45s.
- In production, <=4-player timing is warning at 90s, damage at 120s, target/final at 240s; larger tiers are slower.

Important files:

- `backend/src/games/tanks/danger-zone.service.ts`: config tiers, center picking, phase/radius calculation, public zone state.
- `backend/src/games/tanks/game-loop.service.ts`: initializes zone, applies zone damage each tick, includes zone in `gameState`.
- `backend/src/games/tanks/game.service.ts`: `damagePlayerDirect` for shield-ignoring zone damage.
- `frontend/src/app/scenes/game-scene/danger-zone-renderer.ts`: lava-style ring/overlay renderer.
- `frontend/src/app/scenes/game-scene/game-hud-renderer.ts`: zone warnings such as `LA ZONA SE CIERRA EN Ns` and `FUERA DE ZONA`.

## Development Vs Production Room Behavior

- `DEV_GAME_MODE=true` uses guest auth and development rooms such as `dev-salatest`.
- Development min players is 1, so a dev match can start with one player.
- Development countdown is 3 seconds.
- Production min players is currently 2.
- Production countdown tiers are based on player count.
- `DEV_MANUAL_START` exists, but by default the backend uses authoritative room countdown; do not assume ENTER starts the game unless manual start is enabled.

Frontend HUD listens to room countdown events and can show `STARTING IN Ns`.

## Backend Summary

Important files:

- `backend/src/games/tanks/game.gateway.ts`: Socket.IO gateway, joins/watching, start/restart, auth/guest mode.
- `backend/src/rooms/rooms.service.ts`: lobby/room membership, countdowns, reconnect, finish/release.
- `backend/src/games/tanks/game-loop.service.ts`: authoritative simulation loop, realtime state builder, broadcast cadence, map delta events.
- `backend/src/games/tanks/game.service.ts`: player lifecycle, input validation, movement, dash, shooting, damage, reset.
- `backend/src/games/tanks/maps/map.service.ts`: JSON map loading and legacy map helpers.
- `backend/src/games/tanks/collision.service.ts`: player/obstacle, bullet/obstacle, bullet/player, mirror reflection.
- `backend/src/games/tanks/weapons/`: default weapon, power-up weapons, laser and grenade special logic.
- `backend/src/games/tanks/types/`: server-side contracts.

Loop behavior:

- Each simulation tick computes `deltaTime`.
- While `playing`, it processes power-up spawns, alive players, bullets, win condition, then broadcasts when the network interval is due.
- Player processing moves/clamps/collides tanks unless the player is currently firing a laser.
- Bushes and decorations do not block player movement.
- Power-ups are picked up by radius overlap.
- Shooting delegates to `WeaponService`.
- Bullet processing handles laser beams separately.
- Mirrors reflect bullets; normal solid obstacles absorb bullets; destructible obstacles lose HP.
- Grenades explode on obstacle/player/expiry paths.
- Win condition: if more than one player exists and one or zero are alive, status becomes `finished` and the loop stops after destroyed bodies fade.

## Player Model

Players have `hp`, `maxHp`, `radius`, `speed`, `bodyAngle`, `aimAngle`, color, weapon state, optional active power-up, dash cooldown, shield state, and `alive`.

- Movement input is clamped to `[-1, 1]` and normalized so diagonal movement is not faster.
- Dash is server-authoritative: 4x speed for 300 ms, 5000 ms cooldown, only while moving.
- Shield is server-authoritative.
- Spawn points come from the selected map JSON.

## Map Model

- Current JSON maps live in `backend/src/games/tanks/maps/data/`.
- Large p16 jungle map is approximately 2900 x 2300.
- Obstacle types: `bush`, `decoration`, `wood`, `rock`, `steel`, `mirror`.
- HP: bush 34, wood 68, rock 102, steel 9999, mirror 9999.
- Steel, mirror, and decorations are indestructible.
- Obstacle `assetId` is included for frontend rendering.

## Weapons

- Default weapon: 6 round magazine, 300 ms fire cooldown, 1400 ms reload, max 5 active bullets, speed 600, damage 20.
- Triple shot: three spread angles, temporary power-up.
- Shotgun: five pellets, shorter lifetime/range, temporary power-up.
- Grenade: slower projectile, explosion radius 100, temporary power-up.
- Laser: two shots, beam duration 1000 ms, max distance 1200, can pierce limited metal, special movement/recoil behavior.

## Frontend Summary

Important files:

- `frontend/src/app/app.ts`, `app.html`, `app.css`: Angular shell.
- `frontend/src/app/game/TankGame.ts`: Phaser game bootstrap.
- `frontend/src/app/scenes/BootScene.ts`: asset preloading and transition to `GameScene`.
- `frontend/src/app/scenes/GameScene.ts`: socket setup, map cache, input, rendering, HUD, effects.
- `frontend/src/app/scenes/game-scene/`: renderers/controllers/HUD/tracking helpers.
- `frontend/src/app/network/socket.ts`: Socket.IO client manager.
- `frontend/src/app/network/socket-events.ts`: frontend event names; keep aligned with backend.
- `frontend/src/app/types/`: frontend copies of backend contracts.
- `frontend/public/assets/`: obstacle, weapon, tile, tank template assets.

Frontend responsibilities:

- Connect to backend and emit `joinGame` in dev game routes, or room/lobby events in production flow.
- Store `myPlayerId` from `gameJoined`.
- Cache `map` from `gameJoined` / `watchJoined`.
- Send input at 60 Hz while playing.
- SHIFT sends a one-shot dash request.
- R reloads; Q shield.
- Mouse aim uses the latest authoritative local player position and pointer world coordinates.
- Render only latest authoritative state plus local cached map.
- Do not predict authoritative collisions, HP, kills, obstacle destruction, or winners.

Rendering notes:

- `GameScene` uses Phaser layers: background graphics, glow graphics with ADD blend, main graphics, player UI graphics, plus per-object images/text.
- Obstacles are static render objects keyed by obstacle ID and removed by obstacle events/cache changes.
- Non-mirror obstacles prefer image assets when textures exist; procedural drawing is the fallback.
- Tanks use generated SVG textures for body/turret and destroyed variants.
- Power-ups use `weapon-${assetId}` textures or a tinted fallback.
- HUD displays HP, dash cooldown, shield, ammo/reload, power-up state, player count, status, countdown, and round overlays.
- Camera follows an invisible target moved to the local player.

## Logs And Verification

`GameLoopService` has `ENABLE_NET_LOGS`. It should be `false` by default.

When enabled, logs measure real payload size with:

```ts
Buffer.byteLength(JSON.stringify(payload), 'utf8')
```

The logs include KB per `gameState`, snapshot Hz, recipients, and estimated MB/s per room.

Observed after removing map from `gameState`: 2 players on a small map produced roughly 0.85 KB to 1.45 KB per snapshot at 30 Hz.

Build both packages when changing shared contracts:

```bash
cd backend && npm run build
cd frontend && npm run build
```

Some existing backend tests may have stale expectations around room min players/countdown/power-up caps; verify whether failures are related to the current change before treating them as regressions.

## Development Guidelines

- Preserve the server-authoritative design.
- Prefer small, focused edits in the existing NestJS/Phaser style.
- Treat obstacle positions as centers everywhere.
- Keep bushes non-blocking for tanks unless explicitly changing game design.
- Avoid broad refactors while gameplay behavior is moving quickly.
- When changing backend public fields, update frontend types and rendering/input code in the same change.
- When adding a mechanic that mutates map state, update backend simulation, public events/state, frontend types, and rendering/HUD together.
- Do not reintroduce full `map` into frequent `gameState` without an explicit networking decision.
