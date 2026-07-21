# Rooms Module

Room/lobby membership, dev vs prod configuration, and watcher presence rules.

- Dev vs prod: `DEV_GAME_MODE=true` enables guest auth and development rooms (e.g. `dev-salatest`) with min players 1 and a 3 second countdown. Production requires min players 2 with an authoritative countdown; `DEV_MANUAL_START` exists but isn't the default flow.
- Socket room naming: player room `game:${roomId}:players`, watcher room `game:${roomId}:watchers`, lobby room `lobby`.
- `WatcherPresenceService` (`backend/src/games/tanks/events/watcher-presence.service.ts`) owns watcher join/leave/viewer-count broadcast — physically located in `games/tanks/events/`, but documented here since it's a rooms/lobby concern, consumed by both `RoomsService` and the game gateway/loop.
- Reconnect/finish/release ownership stays with `RoomsService` (`backend/src/rooms/rooms.service.ts`).
