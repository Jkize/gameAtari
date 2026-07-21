# Frontend

Angular 22 zoneless + Phaser client for Tank Arena. Renders authoritative server state and sends input only.

## Zoneless Angular

This app runs without `zone.js`. Any state written from window events, Phaser callbacks, `setTimeout`, or after an `await` must be an Angular signal, or the UI will not update — change detection has no automatic trigger to fall back on.

## UI Theme Convention

App-shell UI (layout, lobby, account, admin panels — anything outside the Phaser canvas) must use theme CSS variables via `frontend/src/app/shared/theme.service.ts` and support light/dark. The bronze/neon in-game palette is scoped to Phaser canvas rendering (`scenes/`) only and must not leak into Angular component styles.

## Module Map

- `account` — account modal state + settings, see `account/CLAUDE.md`.
- `admin-stats` — admin runtime dashboard.
- `auth` — login, guards, `AuthService`.
- `game` — `TankGame.ts` Phaser bootstrap, asset preloading, game host component.
- `layout` — app shell: header, nav, user menu.
- `lobby` — room list, quick play, private room join/create.
- `map-editor` — in-browser map authoring tool.
- `network` — socket connection/auth, see `network/CLAUDE.md`.
- `pwa` — install prompt/service worker.
- `rewards` — reward history/eligibility UI, see `rewards/CLAUDE.md`.
- `scenarios` — background decorative scenarios.
- `scenes` — Phaser game rendering, see `scenes/CLAUDE.md`.
- `shared` — theme service, language switcher, shared rendering helpers.
- `stats` — public stats display.
- `tutorial` — guided tutorial scene/flow.
- `types` — frontend copies of backend public contracts (`types/game-state.types.ts`).
- `users` — admin user list.

## Frontend Responsibilities

- Cache map from `gameJoined` / `watchJoined`.
- Reconcile visible power-ups from `gameState.powerUps`.
- Apply obstacle events to cached map.
- Send input at 60 Hz while playing.
- Do not simulate authoritative collisions, HP, damage, deaths, map mutation, or winners.

## Commands

From `frontend/`:

```bash
npm start
npm run build
npm test
```

## Verification

Build both packages when changing shared contracts:

```bash
cd backend && npm run build
cd frontend && npm run build
```

`frontend/src/app/network/socket-events.ts` frontend event names must stay aligned with backend's socket event names — see `network/CLAUDE.md`.
