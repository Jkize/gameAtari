# Scenes (Phaser Rendering)

Phaser game rendering: `GameScene.ts` plus the `game-scene/` support folder (input, HUD, renderers, effects, state tracking).

## GameScene

- Socket setup happens once in `setupSocket()` against the shared `socketManager` (see `network/CLAUDE.md`).
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

- `GameScene.ts`: socket setup, cached map, snapshot merge, render loop.
- `scenes/game-scene/`: input, HUD, renderers, effects, state change tracking — includes `snapshot-interpolator.ts`, `state-change-tracker.ts`, `game-hud-renderer.ts`, `danger-zone-renderer.ts`, `obstacle-renderer.ts`, `player-renderer.ts`.
