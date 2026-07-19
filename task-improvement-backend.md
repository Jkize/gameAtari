# Backend scalability and room lifecycle improvements

## Objective

Prepare Tank Arena's backend to measure its real capacity, clean up abandoned rooms safely, and eventually scale active matches across multiple game workers without compromising the server-authoritative model.

This document is a planning reference. It does not mean distributed infrastructure must be implemented immediately.

## Current architecture

- NestJS, Socket.IO, room management, and the authoritative game loop run in one Node.js process.
- Runtime rooms and matches are stored in memory.
- Each active match runs at 60 simulation ticks per second.
- Player state is broadcast at 30 snapshots per second.
- Watcher state is broadcast at 15 snapshots per second.
- A single Node.js process executes JavaScript primarily on one event-loop thread.
- Multiple rooms share the same vCPU; a room does not reserve a complete CPU.
- Redis currently supports temporary presence/state, but it is not the authoritative owner of a match simulation.

## Agreed near-term boundaries

The following decisions apply before any worker or horizontal-scaling work:

- Keep the authoritative game simulation, ticks, players, bullets, map mutations, room timers, and active match state in local process memory.
- Keep WebSocket event rate limiting in local memory while the backend runs as a single instance. In particular, do not add a Redis request for every `playerInput` event.
- Continue using Redis for HTTP throttling, authentication sessions, short-lived authentication challenges, and temporary room/presence coordination.
- Use the existing external Redis server. The backend must not start with an in-memory Redis fallback.
- Every Redis key created by this backend must start with `tkgame:`.
- Redis becomes the only source of truth for refresh/authentication sessions. PostgreSQL continues to own users, linked providers, roles, matches, rewards, and other durable domain data.

## Phase 0: external Redis and Redis-only authentication sessions

This phase is the immediate implementation priority. Complete and verify it before the load-testing and scaling phases below.

### Step 0.1: make Redis explicit and mandatory

- Configure the shared `ioredis` client with the global `tkgame:` key prefix.
- Make `REDIS_URL` required by environment validation.
- Connect and `PING` Redis during application bootstrap.
- Fail application startup if Redis is missing or unavailable.
- Remove the silent `ioredis-mock` fallback and the `memory` Redis mode.
- Keep `ioredis`; it is the production client used to connect to the external server.
- Keep `@nest-lab/throttler-storage-redis`; HTTP throttling must use the same prefixed client.
- Update `/health` so Redis failure produces a degraded/unavailable response without reporting an in-memory mode.
- Never log the Redis URL, password, refresh-token hashes, or authentication-session values.

Expected key families after this step:

```text
tkgame:auth:session:{sessionId}
tkgame:auth:phantom:{nonceHash}
tkgame:presence:{userId}
tkgame:room:{roomId}
tkgame:{throttlerKey:throttlerName}:hits
tkgame:{throttlerKey:throttlerName}:blocked
```

The exact throttler suffix is owned by the storage library, but the resulting Redis key must still begin with `tkgame:`.

### Step 0.2: define the Redis authentication-session contract

Store one session record under `tkgame:auth:session:{sessionId}` with a TTL equal to `AUTH_REFRESH_TTL_SECONDS`.

The record must contain only the minimum required metadata:

```ts
{
  refreshHash: string;
  userId: string;
  provider: AuthProvider;
}
```

Rules:

- Store only the cryptographic hash of the refresh token, never the raw token.
- Redis TTL is the authoritative session expiration.
- A missing session key means the session is expired or revoked.
- Redis errors during authentication must fail closed; they must not silently accept a token or fall back to local state.
- During refresh, load the current user from PostgreSQL using the Redis `userId` so username and role changes are reflected in the newly issued access token.
- Access-token authentication continues validating the JWT and then requires the corresponding Redis session key to exist.
- Logout revokes the session by deleting its Redis key.

### Step 0.3: make refresh-token rotation atomic

Replace the current `GET`, compare, and later `SET` sequence with one atomic Redis operation, preferably a small Lua script.

The operation must:

1. Read the current session record.
2. Return `missing` when the session does not exist.
3. Compare the stored refresh hash with the presented token hash.
4. Delete the session and return `reused` when the hashes do not match.
5. Replace the hash with the newly generated refresh hash and renew the TTL when they match.
6. Return `rotated` only after the replacement succeeds.

The service must map `missing` and `reused` to generic authentication failures without exposing sensitive details to the client. Internal logs may distinguish the outcomes using the session ID, but never include either token or token hash.

The frontend should continue serializing refresh requests. Two simultaneous refreshes using the same cookie may intentionally trigger reuse protection and revoke the session.

### Step 0.4: remove Prisma `AuthSession`

After the Redis session flow is covered by tests:

- Remove the `AuthSession` model from `prisma/schema.prisma`.
- Remove the `sessions` relation from `User`.
- Generate a forward-only Prisma migration that drops the `AuthSession` table and its indexes/foreign key.
- Remove all `prisma.authSession` calls from `TokensService`.
- Do not edit or delete the historical initial migration.
- Regenerate Prisma Client and verify that no `AuthSession` references remain.

The deployment will invalidate existing refresh sessions because the Redis key contract and prefix change. Treat this as a controlled one-time logout: deploy the backend and require users to authenticate again. Do not implement dual reads from the old unprefixed keys unless preserving active sessions becomes an explicit release requirement.

### Step 0.5: keep local Redis tooling, remove the runtime mock

- Keep the `redis` and `redis-commander` services in `docker/docker-compose.yml` for local testing.
- Keep their ports, dependency, and `redis-data` volume.
- Configure the backend connection exclusively through `REDIS_URL` in `backend/.env`; production can point to the external server and local development can point to Docker Redis.
- Keep `backend/.env.example` configured for the local Docker Redis without committing production credentials.
- Remove `ioredis-mock` and `@types/ioredis-mock` from `backend/package.json` and the lockfile.
- Do not remove `ioredis`.

### Step 0.6: keep real-time runtime state local

This migration must not change:

- `SocketRateLimiterService` storage for WebSocket events.
- `playerInput` validation frequency or input payload contract.
- `GameSessionsService` runtime storage.
- `GameLoopService` intervals or tick ownership.
- Room countdown, reconnect, inactivity, and round-reset timers.
- Authoritative positions, HP, bullets, collisions, power-ups, danger-zone state, or obstacle mutations.

The existing connection-limit check should eventually reserve a socket during the handshake to close its check-then-add race, but that is a small local-memory fix and is not part of the Redis authentication migration.

### Step 0.7: tests and verification

Add focused unit tests for `TokensService` covering:

- Creating a session stores minimal metadata and the configured TTL.
- Refresh loads the current user and returns a new access/refresh pair.
- Successful rotation invalidates the previous refresh token.
- Reusing an old refresh token revokes the session.
- Missing and expired sessions are rejected.
- Logout removes the session.
- Access authentication rejects a valid JWT whose Redis session is missing.
- Redis failures fail closed.
- No Prisma `AuthSession` call remains.

Add an integration test against a real disposable Redis instance or dedicated test database covering:

- Atomic behavior under simultaneous rotation attempts.
- TTL expiration.
- HTTP throttler keys.
- Phantom challenge keys.
- Room and presence keys.
- Every created key starts with `tkgame:`.

Do not use `ioredis-mock` for the atomic integration tests because it cannot prove production Redis/Lua behavior.

Verification commands:

```bash
cd backend
npx prisma validate
npx prisma generate
npm test
npm run build
```

### Phase 0 definition of done

- The backend cannot boot without a working external Redis connection.
- There is no `ioredis-mock` dependency or runtime fallback.
- Local Docker Compose continues provisioning Redis and Redis Commander for development only.
- All backend Redis keys start with `tkgame:`.
- Refresh sessions exist only in Redis and use TTL expiration.
- Refresh rotation is atomic and reuse revokes the session.
- Prisma no longer contains or generates `AuthSession`.
- HTTP throttling still works through Redis.
- WebSocket input limiting, simulation, and ticks remain local and unchanged.
- Backend tests and build pass.

## Current server baseline

- Provider: Kamatera.
- Server type: B / general purpose.
- CPU: 1 vCPU, Intel Xeon 2.7 GHz or higher.
- RAM: 2 GB.
- Storage: 20 GB.
- Included WAN traffic: 5 TB per month.

This configuration should be sufficient for early validation, many waiting rooms, one active 16-player match, or a small number of lower-population matches. Exact capacity must be measured rather than inferred.

## Important clarification about capacity

Previous CPU and memory figures are conservative estimates, not production measurements.

Expected order of magnitude for one active match, including connections:

| Players | Approximate RAM | Estimated normal CPU on one core | Approximate outbound traffic |
| ---: | ---: | ---: | ---: |
| 2 | 0.3-0.8 MB | Below 1-2% | 0.05-0.2 MB/s |
| 4 | 0.4-1.2 MB | 1-3% | 0.15-0.5 MB/s |
| 8 | 0.7-2 MB | 3-8% | 0.6-1.5 MB/s |
| 16 | 1.3-4.5 MB | 8-20% | 2.5-6 MB/s |

Combat with many simultaneous projectiles may cause higher CPU and network spikes. RAM is unlikely to be the first limit; CPU, event-loop delay, and outbound bandwidth are more likely constraints.

## Phase 1: measure before scaling

Create a reproducible load test with simulated clients for 2, 4, 8, and 16 players.

Measure at least:

- Process CPU usage with `process.cpuUsage()`.
- Resident memory, heap used, and heap growth.
- Event-loop delay.
- Actual game tick execution time, not only the interval between ticks.
- Delayed or skipped ticks.
- Snapshot size and outbound bytes per second.
- Number of active bullets and collision checks.
- Socket.IO reconnect behavior under load.
- Performance with multiple simultaneous rooms.

Suggested scenarios:

1. Players connected but idle.
2. All players moving continuously.
3. All players firing standard weapons.
4. Heavy use of lasers and grenades.
5. Danger zone active.
6. One, two, four, and eight simultaneous rooms.
7. Clients repeatedly disconnecting and reconnecting.

### Initial acceptance targets

- The game loop remains within its 16.67 ms tick budget.
- No sustained event-loop lag that affects player input.
- Memory returns close to baseline after rooms are destroyed.
- No room, game session, interval, or timeout remains after cleanup.
- CPU remains below approximately 70-80% under the intended production load, preserving headroom for spikes.
- Network usage stays within the server's port and monthly transfer limits.

## Phase 2: fix and verify empty-room cleanup

### Current behavior

- If the last player explicitly leaves a room that is not `in_game`, the room is destroyed immediately.
- If private-room players disconnect unexpectedly, their membership is retained for the 60-second reconnect grace period.
- After that grace period, disconnected members are removed.
- A waiting or countdown room is destroyed when the last member is removed.
- A room that becomes empty during `in_game` is not destroyed immediately. The match finishes, the private room resets to `waiting`, and the empty room may remain until its inactivity expiration.

### Desired behavior

Preserve reconnect support, but guarantee that a private room with no members is destroyed after the reconnect grace period regardless of its previous status.

The cleanup must remove:

- The room from the in-memory room map.
- The normalized private-room name index.
- User-to-room associations.
- The authoritative game-loop session.
- Active intervals and timeouts.
- Redis room and presence keys.
- Socket.IO room membership where applicable.

### Required tests

- Last player explicitly leaves a waiting private room.
- Last player disconnects from a waiting private room and does not reconnect.
- All players disconnect during countdown.
- All players disconnect during `in_game`.
- A player reconnects before the grace period and the room is preserved.
- A stale removal timeout cannot remove a reconnected player.
- Destroying an empty room clears its game session and timers.
- The private-room name becomes available again after destruction.

## Phase 3: prepare internal boundaries

Before introducing multiple processes, separate these responsibilities behind clear interfaces:

### Control plane

- Authentication and account session management.
- Lobby and room directory.
- Quick Play matchmaking.
- Private-room metadata and password validation.
- Worker selection.
- Match persistence and rewards.

### Game worker

- Authoritative room runtime.
- Player input processing.
- Maps, movement, weapons, collisions, health, and danger zone.
- Game-state snapshots.
- Match completion summary.

Initially, both interfaces can still use the current local process. This reduces migration risk and creates a seam for future remote workers.

## Phase 4: main server and game workers

Target architecture:

```text
Client
  |
  v
Main server / control plane
  |-- authentication
  |-- lobby and matchmaking
  |-- private-room access
  |-- worker allocation
  |-- persistence and rewards
  |
  +--> Game worker 1: rooms A, B, C
  +--> Game worker 2: rooms D, E, F
  +--> Game worker 3: rooms G, H, I
              |
              v
            Redis
      directory and presence
```

The main server should coordinate the handoff, not proxy every gameplay snapshot. Otherwise it becomes the new network bottleneck.

### Proposed connection flow

1. The client authenticates with the main server.
2. The client creates, joins, or finds a room through Quick Play.
3. The main server chooses a healthy worker with available capacity.
4. Redis records the room-to-worker assignment.
5. The main server returns the worker endpoint and a short-lived signed connection token.
6. The client connects directly to that worker through Socket.IO.
7. The worker validates the token and owns the complete authoritative simulation.
8. The worker sends an idempotent match result to the main server when the match finishes.
9. The main server persists results and processes eligible public-room rewards.

## Worker allocation

Track at least the following information per worker:

- Worker ID and endpoint.
- Health and last heartbeat.
- Active room count.
- Connected player count.
- CPU utilization.
- Event-loop delay.
- Memory usage.
- Delayed game ticks.
- Whether the worker is accepting new rooms or draining.

A room must remain assigned to one worker for its entire active lifetime. Do not split one match across multiple workers.

## Redis responsibilities

Redis may contain:

- `roomId -> workerId` directory entries.
- Worker health and capacity summaries.
- User presence and current room.
- Global lobby summaries.
- Short-lived connection claims or nonces.
- Control-plane events.

Redis must not become the per-tick storage for positions, bullets, HP, collisions, or map mutations. Those remain in the owning worker's memory.

The Socket.IO Redis adapter alone is not enough. It distributes events between processes but does not share authoritative room simulation state.

## Reconnection and failure policy

### Initial production policy

- Reconnect clients to the same worker using the Redis room directory.
- If a worker is temporarily unavailable, retry for a bounded period.
- If the worker process is lost, cancel its active matches cleanly and do not grant rewards.
- Notify affected clients with an i18n message key and a log-friendly backend message.
- Remove stale room-directory entries.

### Future policy

Recovering a live match on another worker would require periodic snapshots, input sequencing, map mutation recovery, and deterministic restoration. This is substantially more complex and should not be part of the first worker implementation.

## Deployment considerations

- Do not enable PM2 Cluster blindly while rooms remain local to each process.
- Multiple processes require sticky room assignment and a global lobby directory.
- A second vCPU still helps the operating system, Nginx, Redis, PostgreSQL, and reward tasks even before game-worker sharding exists.
- Prefer Type B predictable CPU resources for real-time game loops.
- During deployments, mark workers as draining and stop assigning new rooms to them.
- Allow existing matches to finish before shutting down a worker.

## Suggested scaling path

1. Keep the current 1 vCPU / 2 GB server during early validation.
2. Implement load tests and real runtime metrics.
3. Fix empty-room cleanup and prove there are no memory leaks.
4. Upgrade to 2 vCPU / 4 GB if measured utilization requires it.
5. Introduce internal control-plane and game-worker interfaces.
6. Run multiple workers on one multi-vCPU server with room affinity.
7. Add multiple physical/virtual game servers only when concurrency requires horizontal scaling.

## Definition of done for distributed workers

- Quick Play and private rooms are assigned to healthy workers.
- Every room has exactly one authoritative owner.
- All players in a room connect to the same worker.
- The lobby aggregates rooms across all workers.
- Reconnection finds the correct worker.
- Worker capacity and health influence allocation.
- Match completion and rewards remain idempotent.
- A worker can drain without interrupting active matches.
- Stale rooms and directory entries are cleaned automatically.
- Load tests demonstrate the supported rooms per worker.
- Monitoring alerts before tick lag affects gameplay.

## Immediate next task

Implement Phase 0 in small commits: mandatory prefixed Redis client, Redis-only atomic authentication sessions, Prisma cleanup, local-infrastructure removal, and verification. After Phase 0 is complete, continue with the backend load-test and observability task. Distributed workers remain a later phase driven by measured capacity.
