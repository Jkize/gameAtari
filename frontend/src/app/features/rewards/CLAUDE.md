# Rewards (Frontend)

Frontend reward UI: history, eligibility notice, and Phantom linking entry points.

- Lobby notice is non-blocking; Quick Play remains available.
- Use `AuthService.linkPhantom()` for linking. Do not use `loginPhantom()` from the lobby/account popup because it replaces the session.
- Show `Vincular Phantom` only for Google sessions without verified Phantom.
- `frontend/src/app/features/rewards/` contains reusable reward services, models, cards, badges, Solscan links, and eligibility UI.
- Routed reward history screens live in `frontend/src/app/pages/matches/` and compose this feature UI.
- `frontend/src/app/features/account/account-settings/account-settings.component.ts` contains the account linking popup — see `../account/CLAUDE.md` for the modal pattern it follows.
- Backend reward rules/eligibility/idempotency: see `backend/src/rewards/CLAUDE.md` (which points to `backend/src/rewards/AGENTS.md`).
