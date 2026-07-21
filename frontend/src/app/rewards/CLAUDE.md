# Rewards (Frontend)

Frontend reward UI: history, eligibility notice, and Phantom linking entry points.

- Lobby notice is non-blocking; Quick Play remains available.
- Use `AuthService.linkPhantom()` for linking. Do not use `loginPhantom()` from the lobby/account popup because it replaces the session.
- Show `Vincular Phantom` only for Google sessions without verified Phantom.
- `frontend/src/app/rewards/` contains histories, status badge, Solscan link, and eligibility notice.
- `frontend/src/app/account/account-settings.component.ts` contains the account linking popup — see `account/CLAUDE.md` for the modal pattern it follows.
- Backend reward rules/eligibility/idempotency: see `backend/src/rewards/CLAUDE.md` (which points to `backend/src/rewards/AGENTS.md`).
