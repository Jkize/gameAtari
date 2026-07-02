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

## Commands

Run from `backend/`:

```bash
npm run dev
npm run build
npm run start
npm test
```

Some existing backend tests may have stale expectations around room min players/countdown/power-up caps; verify whether failures are related to the current change before treating them as regressions.
