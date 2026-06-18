# AGENTS.md

Project memory for Codex when working in this repository.

## Project Overview

Tank Arena is a real-time multiplayer top-down tank game.

- Backend: NestJS + TypeScript + Socket.IO. It is the authoritative simulation.
- Frontend: Angular 22 shell + Phaser + Socket.IO client. It renders server state and sends input only.
- State is in memory. There is no database, Redis, persistence, ranking, lobby service, or root-level orchestration yet.
- Run backend and frontend in separate terminals.

## Commands

Backend, from `backend/`:

```bash
npm run dev
npm run build
npm run start
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
}
```

The server owns player movement, bullets, weapons, collisions, power-ups, HP, deaths, obstacle destruction, game status, and win/restart behavior.

Main Socket.IO events:

- Client to server: `joinGame`, `watchGame`, `playerInput`, `startGame`, `restartGame`
- Server to client: `gameJoined`, `watchJoined`, `gameStarted`, `gameState`, `playerDisconnected`

Rooms:

- `PLAYER_ROOM`: active players, receives full game state at 60 Hz.
- `WATCHER_ROOM`: spectators, receives state at 30 Hz.

Game states:

- `waiting`: players can join; ENTER/startGame starts.
- `playing`: authoritative loop runs.
- `finished`: win condition reached; ENTER/restartGame resets and re-adds current player sockets.

## Backend Summary

Important files:

- `backend/src/games/tanks/game.gateway.ts`: Socket.IO gateway, joins/watching, start/restart, disconnect cleanup.
- `backend/src/games/tanks/game-loop.service.ts`: authoritative simulation loop and public `GameState` builder.
- `backend/src/games/tanks/game.service.ts`: player lifecycle, input validation, movement, dash, shooting, damage, reset.
- `backend/src/games/tanks/map.service.ts`: predefined 1600x1200 map, obstacles, power-up spawns.
- `backend/src/games/tanks/collision.service.ts`: player/obstacle, bullet/obstacle, bullet/player, mirror reflection.
- `backend/src/games/tanks/weapons/`: default weapon, power-up weapon behavior, laser and grenade special logic.
- `backend/src/games/tanks/types/`: server-side contracts.

Loop behavior in `GameLoopService`:

- Tick rate is 60 Hz.
- Players receive 60 Hz `gameState`; watchers receive 30 Hz.
- Each tick computes `deltaTime`, processes alive players, then bullets, then win condition, then broadcasts.
- Player processing moves/clamps/collides tanks unless the player is currently firing a laser.
- Bushes do not block player movement.
- Power-ups are picked up by radius overlap.
- Shooting delegates to `WeaponService`.
- Bullet processing handles laser beams separately, moves normal bullets with `deltaTime`, expires by lifetime/range/bounds, checks obstacles, then players.
- Mirrors reflect bullets; normal solid obstacles absorb bullets; destructible obstacles lose HP.
- Grenades explode on obstacle/player/expiry paths.
- Win condition: if more than one player exists and one or zero are alive, status becomes `finished` and the loop stops.

Player model highlights:

- Spawn points are fixed.
- Players have `hp`, `maxHp`, `radius`, `speed`, `bodyAngle`, `aimAngle`, color, weapon state, optional active power-up, dash cooldown, and `alive`.
- Movement input is clamped to `[-1, 1]` and normalized so diagonal movement is not faster.
- Dash is server-authoritative: 4x speed for 300 ms, 5000 ms cooldown, only while moving.

Map model:

- World size is 1600x1200.
- Obstacle coordinates are center positions.
- Obstacle types: `bush`, `wood`, `rock`, `steel`, `mirror`.
- HP: bush 34, wood 68, rock 102, steel 9999, mirror 9999.
- Steel and mirror are indestructible.
- Obstacle `assetId` is included for frontend rendering.
- Default power-ups: `triple_shot`, `shotgun`, `grenade`, `laser`.

Weapons:

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
- `frontend/src/app/scenes/GameScene.ts`: socket setup, input, rendering, HUD, effects.
- `frontend/src/app/network/socket.ts`: Socket.IO client manager.
- `frontend/src/app/types/`: frontend copies of state/input contracts.
- `frontend/src/app/rendering/tank-svg-textures.ts`: dynamic tank SVG texture generation.
- `frontend/src/app/scenarios/background-scenarios.ts`: background palette/config.
- `frontend/public/assets/`: obstacle, weapon, tile, tank template assets.

Frontend responsibilities:

- Connect to backend and emit `joinGame`.
- Store `myPlayerId` from `gameJoined`.
- Send input at 60 Hz while playing.
- ENTER starts the game in `waiting`; ENTER restarts in `finished`.
- SHIFT sends a one-shot dash request.
- Mouse aim uses the latest authoritative local player position and pointer world coordinates.
- Render only the latest authoritative `GameState`.
- Do not predict authoritative collisions, HP, kills, obstacle destruction, or winners.

Rendering notes:

- `GameScene` uses Phaser layers: background graphics, glow graphics with ADD blend, main graphics, player UI graphics, plus per-object images/text.
- Obstacles are static render objects keyed by obstacle ID and removed when missing from server state.
- Non-mirror obstacles prefer image assets when textures exist; procedural drawing is the fallback.
- Tanks use generated SVG textures for body/turret and destroyed variants.
- Power-ups use `weapon-${assetId}` textures or a tinted fallback.
- HUD displays HP, dash cooldown, ammo/reload, power-up state, player count, status, and round overlays.
- Camera follows an invisible target moved to the local player.

## Shared Type Expectations

Keep backend and frontend public contracts aligned manually. There is no shared package yet.

Public `GameState` includes:

```ts
{
  status: 'waiting' | 'playing' | 'finished';
  map: {
    width: number;
    height: number;
    obstacles: Obstacle[];
    powerUps: PowerUpSpawn[];
  };
  players: PlayerPublicState[];
  bullets: BulletPublicState[];
}
```

When changing backend public fields, update frontend types and rendering/input code in the same change.

## Development Guidelines

- Preserve the server-authoritative design.
- Prefer small, focused edits in the existing NestJS/Phaser style.
- Treat obstacle positions as centers everywhere.
- Keep bushes non-blocking for tanks unless explicitly changing game design.
- Do not add persistence, Redis, auth, lobbies, rankings, or tournaments unless requested.
- Avoid broad refactors while gameplay behavior is moving quickly.
- When adding a game mechanic, update backend simulation, public state, frontend types, and rendering/HUD together.
- Build both packages when changing shared contracts.
