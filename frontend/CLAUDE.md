# Frontend

Angular 22 zoneless + Phaser client for Tank Arena. Renders authoritative server state and sends input only.

## Zoneless Angular

This app runs without `zone.js`. Any state written from window events, Phaser callbacks, `setTimeout`, or after an `await` must be an Angular signal, or the UI will not update — change detection has no automatic trigger to fall back on.

## UI Theme Convention

App-shell UI (layout, lobby, account, admin panels — anything outside the Phaser canvas) must use theme CSS variables via `frontend/src/app/core/theme/theme.service.ts` and support light/dark. The bronze/neon in-game palette is scoped to `frontend/src/app/game/` and must not leak into Angular component styles.

## Architecture Map

- `core/` — singleton infrastructure: authentication/guards, Socket.IO transport, i18n, and theme. Realtime rules are in `core/realtime/CLAUDE.md`.
- `game/` — all Phaser runtime code: bootstrap, scenes, rendering, audio, input, state, spectator behavior, tutorial runtime, assets, config, and public game contracts. See `game/CLAUDE.md`.
- `pages/` — components loaded directly by `app.routes.ts`: landing, login, lobby, game host, tutorial flow, map editor, match histories, and admin screens.
- `features/` — reusable business UI/data access: account, rewards, matchmaking, public stats, and PWA. See `features/account/CLAUDE.md` and `features/rewards/CLAUDE.md`.
- `layout/` — application shell: header, navigation, session exit, and user menu.
- `shared/` — generic UI, utilities, and config with no game or business-feature ownership.

Cross-boundary imports use `@core`, `@features`, `@game`, `@pages`, `@shared`, and `@env`. Pages may compose lower layers; core/shared/game/features must not import route pages.

Components with separate `.ts`, `.html`, and `.css` files live in dedicated component folders together with their component spec. A folder already containing only one component triplet counts as dedicated; do not add redundant nesting such as `login/login/`.

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

`frontend/src/app/core/realtime/socket-events.ts` frontend event names must stay aligned with backend's socket event names — see `core/realtime/CLAUDE.md`.
