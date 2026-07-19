# Private rooms backend contract

Private rooms are in-memory, password-protected rooms created by authenticated Socket.IO users. They never participate in Quick Play and never award tokens.

## Room kinds

- `public`: created by Quick Play, automatic authoritative countdown, rewards enabled.
- `private`: created by a user, manual admin start, rewards disabled.
- Both kinds use the existing maximum of 16 players.

`lobby:roomsUpdated` and `lobby:listRooms` expose public rooms only. Backend/admin statistics still include both kinds.

## Socket requests

All failures are emitted through `game:error` with a stable UI contract and a human-readable backend message:

```ts
{
  code: 'ROOM_MIN_PLAYERS',
  messageKey: 'lobby.errors.roomMinPlayers',
  messageParams: { minPlayers: 2 },
  message: 'At least 2 players are required to start',
}
```

The frontend should render `transloco.translate(messageKey, messageParams)`. `message` is the English technical fallback and can be recorded in client/server logs; it should not normally be shown when `messageKey` exists. Named parameter objects are used instead of positional arrays so translations may reorder interpolated values safely.

### Create and join

```ts
socket.emit('lobby:createRoom', {
  name: 'Los Tanques',
  password: 'secret',
});

socket.emit('lobby:joinRoom', {
  name: 'los tanques',
  password: 'secret',
});
```

Successful requests emit `room:joined` with the full room state. Names are displayed after trimming/collapsing whitespace and searched through a case-, spacing-, punctuation-, and accent-insensitive camelCase key. For example, `LÓS   Tanques` and `los-tanques` resolve to `losTanques` and cannot coexist.

Room names must contain 3-40 characters. Passwords must contain 4-32 characters. Passwords are stored only as salted scrypt hashes and are never included in public state, lobby events, or Redis.

### Start

```ts
socket.emit('startGame');
```

For a private room, only `adminUserId` may start and the current environment's minimum connected-player requirement must be met. The request starts an authoritative 10-second countdown; it does not start the simulation immediately. The room stops accepting new members once that countdown begins. Public rooms retain their automatic tiered countdown. If the private admin leaves before the match, administration transfers to the oldest remaining member.

The existing `room:countdownStarted`, `room:countdownUpdated`, and `room:countdownCancelled` events carry the updated state to every member. Losing enough connected players during the countdown cancels it and restarts the inactivity deadline.

### Round completion and presence

Public rooms are released after a finished round. Private rooms instead keep their id, name, password, admin, and remaining members. After the normal result delay, the private room returns to `waiting`, receives a new two-minute inactivity deadline, and can start another round.

A transport disconnect does not immediately remove a private-room member. The public state reports `connected: false` during `RECONNECT_GRACE_MS`; reconnecting restores the same membership. When grace expires, the member is removed and administration transfers if necessary.

### Inactivity

A private room has a fixed two-minute start deadline. Joining or leaving does not reset it. Completing a round or cancelling a private countdown creates a fresh deadline.

At 30 seconds remaining:

```ts
socket.on('room:closing', payload => {
  // { roomId, closesAt, remainingSeconds: 30, reason: 'not_started' }
});
```

If the game has not started at expiration:

```ts
socket.on('room:closed', payload => {
  // { roomId, reason: 'inactivity' }
});
```

Members are removed from the Socket.IO room and returned to lobby membership state. Their transport connection remains open. Starting the match cancels both inactivity timers.

## `RoomPublicState`

The existing state now also includes:

```ts
{
  type: 'public' | 'private';
  adminUserId: string | null;
  rewardsEligible: boolean;
  expiresAt: number | null;
}
```

Private room state always has `rewardsEligible: false`. `expiresAt` becomes `null` when the game starts.

## Error codes

- `ROOM_CREATE_INVALID`: missing/non-string create fields.
- `ROOM_JOIN_INVALID`: missing/non-string join fields.
- `ROOM_NAME_INVALID`: invalid name length/content.
- `ROOM_PASSWORD_INVALID`: invalid password length.
- `ROOM_NAME_TAKEN`: normalized name already exists.
- `ROOM_CREATE_IN_PROGRESS`: the same user already has a create request running.
- `ROOM_NOT_FOUND_OR_INVALID_PASSWORD`: lookup failed or password did not match.
- `ROOM_ALREADY_JOINED`: user must leave the current room first.
- `ROOM_FULL`: private room has 16 players.
- `ROOM_ALREADY_STARTED`: room no longer accepts players.
- `ROOM_START_FORBIDDEN`: non-admin attempted to start.
- `ROOM_MIN_PLAYERS`: not enough players to start.

The corresponding translation keys use `lobby.errors.*`. Generic gateway failures use `common.errors.*`, while game-only failures use `game.errors.*`.

## Rewards and persistence

`GameRuntimeState.rewardsEligible` is copied from the room when the authoritative session is prepared. Completed matches persist this value in `Match.rewardsEligible`.

For private matches, top-3 `RewardLog` rows are still created for audit and idempotency, but use:

```ts
{
  potentialAmount: 0,
  amount: 0,
  eligible: false,
  status: 'REWARDS_DISABLED',
  ineligibilityReason: 'REWARDS_DISABLED',
}
```

They do not perform wallet/holder checks, reserve daily capacity, or enter payment processing.

Deploy the schema change before running the updated application:

```bash
npm run prisma:deploy
```

## Backend verification

```bash
npm run prisma:generate
npx jest src/rooms/rooms.service.spec.ts src/matches/matches.service.spec.ts src/rewards/rewards.service.spec.ts --runInBand
npm run build
```
