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
