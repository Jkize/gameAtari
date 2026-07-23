# Network

Socket.IO connection ownership and the frontend's copy of the wire event contract.

## Socket Contract Alignment

`frontend/src/app/core/realtime/socket-events.ts` holds the frontend's copy of event names and must be kept aligned by hand with the backend's socket event names — there is no shared/generated contract file between the two apps. See root `.claude/CLAUDE.md` for the canonical event name catalog.

## SocketManager

`frontend/src/app/core/realtime/socket.ts` owns one long-lived socket instance across route/component changes (`onCreated` callbacks let route-independent listeners survive component destruction and reconnects). Auth payload is `{ token, guestId }`; `guestId` is generated once via `crypto.randomUUID()` per manager instance and persists across reconnects. On a recoverable auth error (expired/missing/invalid token), it refreshes the token and reconnects the same socket rather than creating a new one — don't bypass this by manually calling `io()` elsewhere.

Matchmaking UI and route-independent queue listeners live in `features/matchmaking`; transport ownership and wire contracts stay here.
