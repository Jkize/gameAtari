# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Context Maintenance

- Every code, schema, configuration, contract, or user-visible behavior change must update the pertinent `AGENTS.md` and `CLAUDE.md` context files in the same change.
- Update the closest module context for implementation details and this repository-root context when a cross-cutting contract or project-wide rule changes.
- Before finishing, verify that affected context documents match the implementation and remove obsolete guidance.

## Project Overview

Tank Arena is a real-time multiplayer browser game.

- Backend: NestJS + TypeScript + Socket.IO. The backend is the authoritative simulation.
- Frontend: Angular shell + Phaser + Socket.IO client. The frontend renders authoritative state and sends input only.
- Runtime game state is in memory.
- Rooms/lobby/auth/persistence exist; avoid adding new persistence, rankings, tournaments, or broad infrastructure unless requested.
- Run backend and frontend in separate terminals.

## Module Context

Claude Code auto-loads nested `CLAUDE.md` files when work happens under that directory. Module-specific detail lives there instead of here:

- `backend/CLAUDE.md` — backend module map, Nest wiring conventions, matches/persistence
- `backend/src/games/tanks/CLAUDE.md` — game loop, networking Hz detail, socket state contract, map/obstacles/power-ups, danger zone
- `backend/src/auth/CLAUDE.md` — RBAC, wallet linking backend rules
- `backend/src/rooms/CLAUDE.md` — dev/prod room config, countdown, watcher presence
- `backend/src/rewards/CLAUDE.md` — pointer to `rewards/AGENTS.md` (full rewards rules live there, not auto-loaded by Claude Code otherwise)
- `frontend/CLAUDE.md` — Angular/Phaser overview, zoneless signals rule, UI theme convention, module map, frontend responsibilities
- `frontend/src/app/game/CLAUDE.md` — GameScene, snapshot interpolation, rendering/audio/input boundaries
- `frontend/src/app/core/realtime/CLAUDE.md` — SocketManager, socket-events alignment with backend
- `frontend/src/app/features/rewards/CLAUDE.md` — frontend reward UI rules
- `frontend/src/app/features/account/CLAUDE.md` — account-as-modal pattern

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

Frequent `gameState` does not include the map. Full detail (payload shapes, one-time map delivery) is in `backend/src/games/tanks/CLAUDE.md`.

Accumulated private-room round statistics travel through `room:stateUpdated`, not frequent `gameState`. The in-memory room scoreboard survives private rematches but resets when the room is destroyed or the backend restarts; durable per-round history remains in PostgreSQL.

## Match History Contract

- Every completed round has a unique `roundId`; `Match.roomId` is a non-unique grouping key for rematches in the same room.
- Matches snapshot `roomName`, `roomType: PUBLIC | PRIVATE`, and `rewardsEligible`.
- Room visibility and reward eligibility are independent decisions.
- All history/detail browsing requires authentication. Global history/detail includes only public matches; private match detail is available only to participants.
- Personal history contains both types, while private matches omit reward status and amount presentation.

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

## Development Guidelines

- Preserve the server-authoritative design.
- Prefer small, focused edits in the existing NestJS/Phaser style.
- Treat obstacle positions as centers everywhere.
- Keep bushes non-blocking for tanks unless explicitly changing game design.
- Avoid broad refactors while gameplay behavior is moving quickly.
- Update backend simulation, public contracts/events, frontend types, and rendering/HUD together when adding mechanics.
- Do not reintroduce full map into frequent `gameState` without an explicit networking decision.

## Verification

Build both packages when changing shared contracts:

```bash
cd backend && npm run build
cd frontend && npm run build
```

Backend-specific verification (ENABLE_NET_LOGS, stale test caveats) is in `backend/CLAUDE.md`.
