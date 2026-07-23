# Game Runtime

All Phaser-owned code lives here: bootstrap, scenes, rendering, audio, input, state interpolation/tracking, spectator behavior, tutorial runtime, asset catalogs, configuration, and frontend copies of public game contracts.

## GameScene

- Socket setup happens once in `scenes/game-scene.ts` against the shared `socketManager` (see `../core/realtime/CLAUDE.md`).
- Caches the map from `gameJoined`/`watchJoined` and merges it with each realtime `gameState` snapshot, which excludes the map.
- Applies `obstacle:damaged`/`obstacle:destroyed` events to the cached map.
- Uses `SnapshotInterpolator` — the latest raw snapshot is authoritative for input/HUD/audio/hit-tracking, the interpolated snapshot is for visual rendering only. Don't conflate the two.

## Rendering Notes

- Obstacles are static render objects keyed by obstacle ID.
- Power-ups use `weapon-${assetId}` textures or tinted fallback.
- HUD shows HP, dash, shield, ammo/reload, active power-up, player count, countdown/status overlays.
- Camera follows an invisible target moved to the local player.

## Danger Zone Rendering

This folder renders `gameState.dangerZone` (lava-style world renderer + HUD warning) but does not own any zone logic — timing/radius/phase are entirely backend-authoritative, see `backend/src/games/tanks/CLAUDE.md` for the full mechanic. Never apply zone damage or move players client-side.

## Important Files

- `bootstrap/tank-game.ts`: Phaser configuration and scene registration.
- `scenes/boot-scene.ts`: Phaser asset loading.
- `scenes/game-scene.ts`: socket setup, cached map, snapshot merge, and render loop.
- `audio/`: music and gameplay sound coordination.
- `input/`: keyboard, pointer, and touch input; emits input only.
- `rendering/`: world/object renderers, HUD, effects, generated textures, and decorative scenarios.
- `state/`: snapshot interpolation and authoritative-state change tracking.
- `spectator/`: spectator camera and target selection.
- `tutorial/`: Phaser tutorial game/scene; Angular tutorial route components stay in `../pages/tutorial/`.
- `contracts/`: frontend copies of backend public state/input contracts.

Nothing in `game/` may import route pages or reusable business features. Use `@game/*` aliases between game subdomains rather than deep relative imports.
