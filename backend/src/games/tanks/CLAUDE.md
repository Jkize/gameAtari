# Tanks Game Module

Server-authoritative simulation, networking payload shapes, map/obstacle/power-up rules, and danger zone mechanics for the tanks game.

## Networking Model

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
- `frontend/src/app/game/rendering/danger-zone-renderer.ts`: lava-style world renderer.
- `frontend/src/app/game/rendering/hud/game-hud-renderer.ts`: zone warning HUD.

## Loop Behavior

- Tick at 60 Hz.
- While `playing`, process power-up spawns, players, bullets, win condition, then broadcast when player/watcher network interval is due.
- Player movement is skipped while the player is firing a laser.
- Bushes and decorations do not block player movement.
- Power-ups are picked up by radius overlap.
- Mirrors reflect bullets.
- Destructible obstacles lose HP and are removed at zero HP.
- Win condition: if more than one player exists and one or zero are alive, status becomes `finished`; loop stops after destroyed bodies fade.

## Important Files

- `backend/src/games/tanks/game.gateway.ts`: Socket.IO gateway, auth/guest mode, game joins/watch.
- `backend/src/games/tanks/game-loop.service.ts`: simulation loop, realtime state builder, network broadcast cadence, map delta events.
- `backend/src/games/tanks/game.service.ts`: player lifecycle, input validation, movement, dash, shield, shooting, damage, reset.
- `backend/src/games/tanks/maps/map.service.ts`: JSON map loading and legacy helper map.
- `backend/src/games/tanks/collision.service.ts`: AABB/swept collision and mirror reflection.
- `backend/src/games/tanks/weapons/`: default, power-up, laser, and grenade behavior.
- `backend/src/games/tanks/types/`: backend contracts.
- `backend/src/games/tanks/danger-zone.service.ts`: danger zone tier configs and phase logic (see Danger Zone above).
- `backend/src/games/tanks/events/elimination.service.ts`: elimination order tracking.
- `backend/src/games/tanks/events/watcher-presence.service.ts`: watcher join/leave/viewer-count broadcast; documented in depth in `backend/src/rooms/CLAUDE.md` since it's a rooms/lobby concern despite living in this folder.

## Verification

`GameLoopService` has `ENABLE_NET_LOGS`; it should remain `false` by default. When enabled, it measures real payload size using:

```ts
Buffer.byteLength(JSON.stringify(payload), 'utf8')
```

Recent observed payload after removing map from `gameState`: about 0.85 KB to 1.45 KB per snapshot with 2 players on a small map at 30 Hz.
