# Account

Account/settings UI, kept as a modal rather than a routed page.

- Account/settings stay as a modal, not a routed page. `AccountModalStateService` (`account-modal-state.service.ts`) is a signal-based `open` boolean toggled by `show()`/`hide()`, consumed from `frontend/src/app/layout/`. Don't add a new page route for content that already has a home as a modal.
- Phantom wallet linking is done via `AuthService.linkPhantom()`, called from `account-settings/account-settings.component.ts` — see `../rewards/CLAUDE.md` for the full linking rule (never use `loginPhantom()` here, it replaces the session).
