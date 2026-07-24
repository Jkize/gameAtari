# Rooms Module

Room/lobby membership, dev vs prod configuration, and watcher presence rules.

- Dev vs prod: `DEV_GAME_MODE=true` enables guest auth and development rooms (e.g. `dev-salatest`) with min players 1 and a 3 second countdown. Production requires min players 2 with an authoritative countdown; `DEV_MANUAL_START` exists but isn't the default flow.
- Socket room naming: player room `game:${roomId}:players`, watcher room `game:${roomId}:watchers`, lobby room `lobby`.
- `WatcherPresenceService` (`backend/src/games/tanks/events/watcher-presence.service.ts`) owns watcher join/leave/viewer-count broadcast — physically located in `games/tanks/events/`, but documented here since it's a rooms/lobby concern, consumed by both `RoomsService` and the game gateway/loop.
- Reconnect/finish/release ownership stays with `RoomsService` (`backend/src/rooms/rooms.service.ts`).
- Private rooms survive round completion. After `ROUND_RESET_MS`, the game session is removed and the room returns to `waiting` with the same `roomId`.
- Each private-room member accumulates `roundsPlayed`, `roundWins`, `kills`, and `damageDealt` in memory across rematches. `RoomsService.finish()` updates these values before emitting the finished room state.
- `room:stateUpdated` carries the full accumulated member scoreboard immediately after finish and again when the private room returns to `waiting`.
- This room scoreboard is intentionally ephemeral: it survives reconnects while the room exists, but resets if the room is destroyed or the backend restarts. Per-round `Match`/`MatchPlayer` rows remain durable.
