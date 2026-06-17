# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tank Arena — a real-time multiplayer browser game. The backend is the authoritative game server; the frontend is a pure renderer and input forwarder. No persistence layer exists.

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
                                              ├─ GameLoopService (30-tick setInterval)
                                              ├─ CollisionService (AABB + swept checks)
                                              └─ MapService      (map generation)
```

The Angular app (`app.ts`) mounts a `<canvas>` element and hands it to `TankGame`. Angular itself plays no further role in gameplay — all rendering and networking lives inside Phaser scenes.

### Socket.IO event contract

| Direction | Event | Payload |
|-----------|-------|---------|
| Client → Server | `joinGame` | — |
| Server → Client | `gameJoined` | `{ playerId, map, status }` |
| Client → Server | `playerInput` | `PlayerInput` (moveX, moveY, aimAngle, shoot, dash) |
| Client → Server | `startGame` | — |
| Server → Client | `gameState` | `GameState` (full snapshot every tick) |
| Server → Client | `gameStarted` | `{ status }` |
| Server → Client | `playerDisconnected` | `{ id }` |

The server broadcasts the full `GameState` on every tick (30 Hz). The client sends input at the same rate, throttled by `INPUT_HZ`.

### Game loop (`GameLoopService`)

Each tick (33 ms):
1. Move all alive players (`GameService.movePlayer`) — applies dash multiplier (4×) during `dashUntil` window.
2. Clamp players to map bounds.
3. Resolve player vs obstacle collisions (skips `bush` type).
4. Process shooting (`GameService.tryShoot`).
5. Advance bullets; run swept `bulletVsObstacleAlongPath` check per bullet per obstacle.
   - `mirror` → reflect and continue; all others → absorb bullet, damage/destroy obstacle.
6. Run bullet vs player collision.
7. Check win condition (≤1 alive player when >1 have joined → `finished`, loop stops).
8. Broadcast `gameState`.

### Collision system (`CollisionService`)

- All obstacles are AABB (axis-aligned bounding boxes). Positions are **centers**; bounds are derived as `x ± width/2`, `y ± height/2`.
- Player vs obstacle: resolves by restoring the axis the player approached from (`previousX`/`previousY` side detection).
- Bullet path check: slab-method ray vs expanded AABB, falls back to point-in-AABB for current position.
- Mirror reflection: determines hit face from bullet's previous position; flips the corresponding direction component and repositions bullet outside the surface.

### Obstacle types

| Type | Destructible | HP | Notes |
|------|-------------|-----|-------|
| bush | yes | 34 | No collision for players; bullets pass through and damage it |
| wood | yes | 68 | Solid cover |
| rock | yes | 102 | Solid cover |
| steel | no | 9999 | Indestructible anchor |
| mirror | no | 9999 | Reflects bullets |

Obstacle HP is tuned so one bullet (34 damage) destroys a bush, two destroy wood, three destroy rock.

### Rendering (GameScene)

Three Phaser `Graphics` layers redrawn each frame:
- **`bgGfx`** depth 0 — static map background (drawn once on `gameJoined`).
- **`glowGfx`** depth 4, `ADD` blend mode — all glows (player halos, bullet halos, mirror bloom).
- **`mainGfx`** depth 5, normal blend — tank bodies, HP bars, bullet cores.

Static obstacle graphics objects (`obsGfx: Map<id, GameObject>`) sit at depth 2 (or 6 for bushes). They are created on first sight of an obstacle ID and destroyed when that ID disappears from the server state.

`BootScene` attempts to load sprite assets from `frontend/public/assets/obstacle/`. If the texture key exists, `GameScene` uses `this.add.image()`; otherwise it falls back to procedural canvas drawing (the `drawXxxObstacle` methods). Both paths check `obs.assetId` first, then fall back to `OBSTACLE_ASSET_BY_TYPE[obs.type]`.

### Map

Fixed 1600×1200 px world. `MapService.buildPredefinedObstacles()` constructs the layout using helpers (`addSymmetric`, `addHorizontalLine`, `addVerticalLine`, `addBushPair`, `addBushQuad`). The map is generated once at gateway init and again at `startGame` if missing. Obstacle coordinates are **center** positions.

### Game states

`waiting` → `playing` → `finished`. The `startGame` socket event transitions `waiting → playing`. `finished` is set by `GameLoopService` when the win condition triggers. There is no reset path in the current codebase — clients must refresh.
