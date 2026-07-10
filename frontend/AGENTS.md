# Frontend Instructions

Frontend for Tank Arena: Angular shell + Phaser + Socket.IO client.

## Responsibilities

- Render the latest authoritative server state plus the cached map.
- Send player input only.
- Do not predict or authoritatively calculate collisions, HP, kills, obstacle destruction, danger-zone damage, winners, or map mutations.
- Store `myPlayerId` from `gameJoined`.
- Cache `map` from `gameJoined` / `watchJoined`.

## Important Files

- `src/app/app.ts`, `app.html`, `app.css`: Angular shell.
- `src/app/game/TankGame.ts`: Phaser game bootstrap.
- `src/app/scenes/BootScene.ts`: asset preloading and transition to `GameScene`.
- `src/app/scenes/GameScene.ts`: socket setup, map cache, input, rendering, HUD, effects.
- `src/app/scenes/game-scene/`: renderers/controllers/HUD/tracking helpers.
- `src/app/scenes/game-scene/danger-zone-renderer.ts`: lava-style ring/overlay renderer.
- `src/app/scenes/game-scene/game-hud-renderer.ts`: zone warnings and HUD state.
- `src/app/network/socket.ts`: Socket.IO client manager.
- `src/app/network/socket-events.ts`: frontend event names; keep aligned with backend.
- `src/app/types/`: frontend copies of backend contracts.
- `public/assets/`: obstacle, weapon, tile, tank template assets.
- `src/app/rewards/`: reward notice, personal history, public recent matches, match detail, Solscan link/status badge.
- `src/app/account/account-settings.component.ts`: account popup for linking Google/Phantom.
- `src/app/auth/auth.service.ts`: login and account-linking client methods.

## Networking Rules

- Frequent `gameState` includes players, bullets, powerUps, impactEvents, status, and optional dangerZone.
- Frequent `gameState` does not include full map, obstacles, spawnPoints, width, or height.
- Merge realtime power-ups into the cached map:

```ts
this.currentMap.powerUps = state.powerUps;
this.gameState = { ...state, map: this.currentMap };
```

- Obstacle render state must react to `obstacle:damaged` and `obstacle:destroyed`.
- Room countdown events can show `STARTING IN Ns`.

## Rewards UI

- Lobby shows a non-blocking token rewards notice. It must never block Quick Play.
- The Phantom link button is only for a logged-in Google session that does not already have verified Phantom. Use `AuthService.linkPhantom()`, not `loginPhantom()`, so the Google session is not replaced.
- Lobby may show an informational 10,000-token holder check from `/wallets/me`, but the authoritative eligibility check still happens at match end on the backend.
- Do not infer or construct Solscan URLs in the frontend. Use `solscanUrl` returned by the backend and open links with safe new-tab attributes.
- Reward history routes:
  - `/rewards/me` calls `GET /rewards/me/history` with auth and cursor pagination.
  - `/matches/recent` calls `GET /rewards/matches/recent`.
  - `/matches/:matchId` calls `GET /rewards/matches/:matchId`.
- Histories load at most 50 rows per backend page and append more when `nextCursor` exists.
- Personal history may show specific ineligibility reasons; public history should show public payment/eligibility state without internal errors.

## Input Rules

- Send input at 60 Hz while playing.
- SHIFT sends a one-shot dash request.
- R reloads.
- Q shield.
- Mouse aim uses the latest authoritative local player position and pointer world coordinates.

## Rendering Notes

- `GameScene` uses Phaser layers: background graphics, glow graphics with ADD blend, main graphics, player UI graphics, plus per-object images/text.
- Obstacles are static render objects keyed by obstacle ID and removed by obstacle events/cache changes.
- Non-mirror obstacles prefer image assets when textures exist; procedural drawing is the fallback.
- Tanks use generated SVG textures for body/turret and destroyed variants.
- Power-ups use `weapon-${assetId}` textures or a tinted fallback.
- HUD displays HP, dash cooldown, shield, ammo/reload, power-up state, player count, status, countdown, and round overlays.
- Camera follows an invisible target moved to the local player.

## Commands

Run from `frontend/`:

```bash
npm start
npm run build
npm test
```
