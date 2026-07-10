# Rewards Module Instructions

This folder owns SPL token reward eligibility, payment lifecycle, reward history, and retry/reconciliation logic.

## Core Invariants

- Rewards are for authenticated registered users with verified linked Phantom wallets. Local/dev guest-style players may be persisted for testing/history but are not eligible for production rewards.
- Create or reuse exactly one `RewardLog` per `(matchId, placement)` for placements 1, 2, and 3.
- Idempotency key format is deterministic: `MATCH_REWARD:{matchId}:{placement}`.
- Prize amounts are fixed in `rewards.config.ts`: 1st = 700, 2nd = 300, 3rd = 100. Never redistribute a missed prize.
- Eligibility is evaluated using the wallet's token balance at match end, before reward payment.
- Daily limit is 10,000 tokens and uses America/Bogota dates.
- PostgreSQL is the source of truth for reward idempotency, daily reservations, retry state, and transaction signatures. Do not use Redis for reward consistency.

## RewardLog Lifecycle

- `RewardLog` stores both eligibility audit data and payment state.
- Non-eligible top-3 players still need a `RewardLog` for history/audit.
- Retry recoverable failures on the same `RewardLog`; never insert a replacement reward row.
- A `SUBMITTED` reward with `transactionSignature` must be reconciled before any resend attempt.
- `transactionSignature` is unique when present.
- Payment processor work claiming must stay atomic with PostgreSQL row updates and `FOR UPDATE SKIP LOCKED` style behavior.

## Solana And Helius

- Use `SolanaGateway` from `backend/src/solana`; do not call Helius/RPC directly from rewards services.
- `SolanaConfigService` owns network selection: `NODE_ENV=production` => mainnet-beta, otherwise devnet.
- `MINT` is the token mint. Check token-account balance for that mint only; never use SOL balance or a general wallet balance for eligibility.
- Use bigint/raw units for token math and helpers in `rewards.types.ts` for decimal conversion.
- Gateway/RPC failures must not be converted to insufficient balance.

## History API

- `RewardsHistoryController` exposes:
  - `GET /rewards/me/history`
  - `GET /rewards/matches/recent`
  - `GET /rewards/matches/:matchId`
- History pages are capped at 50 rows and use cursor pagination.
- Backend must generate `solscanUrl`; frontend should only render returned URLs.
- Public history should avoid internal error details. Personal history can include user-facing ineligibility reasons.

## Module Wiring

- `RewardsModule` owns rewards providers and `RewardsHistoryController`.
- Keep `RewardsModule` imported by an active Nest module. If history routes return 404, first verify Nest logs contain:
  - `Mapped {/rewards/me/history, GET} route`
  - `Mapped {/rewards/matches/recent, GET} route`
  - `Mapped {/rewards/matches/:matchId, GET} route`
- `GameModule` should import `RewardsModule` instead of manually declaring rewards providers, to avoid duplicate scheduler/processor instances.

## Verification

Run from `backend/` after rewards changes:

```bash
npm run build
npx jest src/rewards --runInBand
```

If tests import `SolanaConfigService`, mock `@solana/web3.js` in the spec to avoid Jest ESM parsing issues from Solana dependencies.
