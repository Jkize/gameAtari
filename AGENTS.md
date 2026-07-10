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
