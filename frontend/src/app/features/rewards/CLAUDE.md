# Rewards (Frontend)

Frontend reward UI: history, eligibility notice, and Phantom linking entry points.

- Lobby notice is non-blocking; Quick Play remains available.
- When rewards are enabled, V2 uses one `View rewards` trigger inside the right-rail reward panel, between its heading and the horizontal wallet/balance row. The battle card must not contain reward controls or inline prize details.
- The right-rail panel stays compact and answers whether the current account is eligible through one horizontal verified-wallet/balance row. It must not contain explanatory copy or inline prizes.
- The modal uses two columns on wide screens (player-count prizes and eligibility/rules), stacks them on narrow screens, and consumes the exact schedule from `GET /rewards/config`; do not duplicate backend formulas in Angular. It explains the 4, 5-8, and 9-16 player tiers, that amounts are frozen when the round starts, and that missed prizes are not redistributed.
- Use `AuthService.linkPhantom()` for linking. Do not use `loginPhantom()` from the lobby/account popup because it replaces the session.
- Show `Vincular Phantom` only for Google sessions without verified Phantom.
- `frontend/src/app/features/rewards/` contains reusable reward services, models, cards, badges, Solscan links, and eligibility UI.
- Routed reward history screens live in `frontend/src/app/pages/matches/` and compose this feature UI.
- Match history is broader than rewards and all history screens require authentication: personal history contains public and private matches, while global recent history contains public matches only.
- Models carry `roomId`, `roomName`, `roomType`, and `rewardsEligible`. Treat room visibility and reward eligibility as independent.
- `/matches/:matchId` uses authenticated `GET /rewards/me/matches/:matchId`, which permits public matches and participant-owned private matches.
- Render reward status, amounts, ineligibility details, and Solscan links only when `rewardsEligible` is true and reward data exists.
- Private matches display gameplay results and room type without “Rewards disabled”, “Not eligible”, zero-token amounts, or a “No rewards” badge.
- `frontend/src/app/features/account/account-settings/account-settings.component.ts` contains the account linking popup — see `../account/CLAUDE.md` for the modal pattern it follows.
- Backend reward rules/eligibility/idempotency: see `backend/src/rewards/CLAUDE.md` (which points to `backend/src/rewards/AGENTS.md`).
