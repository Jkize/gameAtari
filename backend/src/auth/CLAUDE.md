# Auth Module

RBAC access control and wallet/account linking rules for the auth module.

- Global `RolesGuard` is registered as `APP_GUARD` inside `AuthModule` (`backend/src/auth/auth.module.ts`); access control uses `@Public()` / `@Allow(EAuth.ADMIN)` decorators, not an env allowlist. Admins are promoted via direct SQL, not the API.
- Dependency direction: `AuthModule` imports `UsersModule` and `SolanaModule`. `UsersModule` must never import `AuthModule` back.
- Wallet linking (`WalletsController`/`WalletsService`) verifies a signed Phantom challenge without touching the current login session. Google linking (`AccountController`) never auto-merges an already-linked account.
- `AuthModule` imports `SolanaModule` because `GET /wallets/me` does an informational holder-balance check. Actual reward-eligibility balance checks live in `rewards/` (see `backend/src/rewards/CLAUDE.md`).
