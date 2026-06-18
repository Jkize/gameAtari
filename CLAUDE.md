# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tank Arena — a real-time multiplayer browser game. The backend is the authoritative game server; the frontend is a pure renderer and input forwarder. No persistence layer exists (no database, Redis, auth, lobbies, or rankings).

## Dev Commands

Both packages must run simultaneously during development.

**Backend** (`backend/`)
```
npm run dev          # nest start --watch (hot-reload)
npm run build        # nest build
npm run start        # production start
```

**Frontend** (`frontend/`)
```
npm start            # ng serve  (http://localhost:4200)
npm run build        # ng build
npm test             # vitest via ng test
```

There are no shared scripts at the repo root — open two terminals.

## Architecture

### Data flow

```
Browser (Angular shell)
  └─ TankGame (Phaser.Game)
       ├─ BootScene  → preloads assets, fades into GameScene
       └─ GameScene  ←→  Socket.IO  ←→  GameGateway (NestJS)
                                              ├─ GameService     (state + physics constants)
                                              ├─ GameLoopService (60-tick setInterval)
                                              ├─ CollisionService (AABB + swept checks)
                                              └─ MapService      (map generation)
```

The Angular app (`app.ts`) mounts a `<canvas>` element and hands it to `TankGame`. Angular itself plays no further role in gameplay — all rendering and networking lives inside Phaser scenes.

### Socket.IO event contract

| Direction | Event | Payload |
|-----------|-------|---------|
| Client → Server | `joinGame` | — |
| Client → Server | `watchGame` | — |
| Client → Server | `playerInput` | `PlayerInput` (moveX, moveY, aimAngle, shoot, dash) |
| Client → Server | `startGame` | — |
| Client → Server | `restartGame` | — |
| Server → Client | `gameJoined` | `{ playerId, map, status }` |
| Server → Client | `watchJoined` | — |
| Server → Client | `gameState` | `GameState` (full snapshot every tick) |
| Server → Client | `gameStarted` | `{ status }` |
| Server → Client | `playerDisconnected` | `{ id }` |

- `PLAYER_ROOM`: active players — receive full `gameState` at **60 Hz**.
- `WATCHER_ROOM`: spectators — receive `gameState` at **30 Hz**.

The client sends input at 60 Hz, throttled by `INPUT_HZ`.

The client must not send positions, HP, damage, collision results, winners, or map mutations — only `PlayerInput`.

### Game loop (`GameLoopService`)

Tick rate: **60 Hz**. Each tick computes `deltaTime`, then:

1. Move all alive players (`GameService.movePlayer`) — applies dash multiplier (4×) during `dashUntil` window. Player movement is skipped while the player is firing a laser.
2. Clamp players to map bounds.
3. Resolve player vs obstacle collisions (skips `bush` type).
4. Process shooting (`GameService.tryShoot`) via `WeaponService`.
5. Advance bullets with `deltaTime`:
   - Laser beams are handled separately from normal bullets.
   - Expired bullets (lifetime/range/bounds) are removed.
   - Swept `bulletVsObstacleAlongPath` check per bullet per obstacle:
     - `mirror` → reflect and continue.
     - Solid obstacles → absorb bullet, damage/destroy obstacle.
   - Grenades explode on obstacle hit, player hit, or expiry.
6. Run bullet vs player collision.
7. Check win condition: if more than one player has joined and ≤1 are alive → `finished`, loop stops.
8. Broadcast `gameState` to `PLAYER_ROOM` (every tick) and `WATCHER_ROOM` (every other tick).

### Collision system (`CollisionService`)

- All obstacles are AABB (axis-aligned bounding boxes). Positions are **centers**; bounds are derived as `x ± width/2`, `y ± height/2`.
- Player vs obstacle: resolves by restoring the axis the player approached from (`previousX`/`previousY` side detection).
- Bullet path check: slab-method ray vs expanded AABB, falls back to point-in-AABB for current position.
- Mirror reflection: determines hit face from bullet's previous position; flips the corresponding direction component and repositions bullet outside the surface.
- Power-ups are picked up by radius overlap.
- Bushes do not block player movement.

### Obstacle types

| Type | Destructible | HP | Notes |
|------|-------------|-----|-------|
| bush | yes | 34 | No collision for players; bullets pass through and damage it |
| wood | yes | 68 | Solid cover |
| rock | yes | 102 | Solid cover |
| steel | no | 9999 | Indestructible anchor |
| mirror | no | 9999 | Reflects bullets |

### Weapons & Power-ups

**Default weapon:** 6-round magazine, 300 ms fire cooldown, 1400 ms reload, max 5 active bullets, speed 600, damage 20.

| Power-up | Behavior |
|----------|----------|
| `triple_shot` | Three bullets at spread angles (temporary) |
| `shotgun` | Five pellets, shorter lifetime/range (temporary) |
| `grenade` | Slower projectile, explosion radius 100 (temporary) |
| `laser` | 2 shots, beam duration 1000 ms, max distance 1200, can pierce limited metal, special movement/recoil |

Default power-up spawns on the map: `triple_shot`, `shotgun`, `grenade`, `laser`.

### Player model

Players have: `hp`, `maxHp`, `radius`, `speed`, `bodyAngle`, `aimAngle`, color, weapon state, optional active power-up, dash cooldown, and `alive`.

- Movement input is clamped to `[-1, 1]` and normalized so diagonal movement is not faster.
- **Dash:** 4× speed for 300 ms, 5000 ms cooldown, only while moving. Server-authoritative.
- Spawn points are fixed.

### Rendering (GameScene)

Phaser layers redrawn each frame:
- **`bgGfx`** depth 0 — static map background (drawn once on `gameJoined`).
- **`glowGfx`** depth 4, `ADD` blend mode — all glows (player halos, bullet halos, mirror bloom).
- **`mainGfx`** depth 5, normal blend — tank bodies, HP bars, bullet cores.

Static obstacle graphics (`obsGfx: Map<id, GameObject>`) sit at depth 2 (or 6 for bushes). Created on first sight of an obstacle ID; destroyed when that ID disappears from server state.

Non-mirror obstacles prefer image assets when textures exist; procedural drawing is the fallback. Both paths check `obs.assetId` first, then `OBSTACLE_ASSET_BY_TYPE[obs.type]`.

Tanks use generated SVG textures (body/turret and destroyed variants). Power-ups use `weapon-${assetId}` textures or a tinted fallback.

HUD displays: HP, dash cooldown, ammo/reload, power-up state, player count, status, and round overlays.

Camera follows an invisible target moved to the local player position.

### Map

Fixed 1600×1200 px world. `MapService.buildPredefinedObstacles()` constructs the layout using helpers (`addSymmetric`, `addHorizontalLine`, `addVerticalLine`, `addBushPair`, `addBushQuad`). Map is generated once at gateway init and again at `startGame` if missing. Obstacle coordinates are **center** positions.

### Game states

`waiting` → `playing` → `finished`.

- `startGame` transitions `waiting → playing`.
- `finished` is set by `GameLoopService` when the win condition triggers.
- `restartGame` resets the game and re-adds current player sockets, returning to `waiting`.

### Public `GameState` shape

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

When changing backend public fields, update frontend types and rendering/input code in the same change. There is no shared package — contracts are kept in sync manually.

## Development Guidelines

- Preserve the server-authoritative design. The client only sends `PlayerInput`.
- Prefer small, focused edits in the existing NestJS/Phaser style.
- Treat obstacle positions as centers everywhere.
- Keep bushes non-blocking for tanks unless explicitly changing game design.
- Do not add persistence, Redis, auth, lobbies, rankings, or tournaments unless requested.
- Avoid broad refactors while gameplay behavior is moving quickly.
- When adding a game mechanic, update backend simulation, public state, frontend types, and rendering/HUD together.
- Build both packages when changing shared contracts.
