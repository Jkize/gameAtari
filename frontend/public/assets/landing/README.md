# Landing page media (pending)

None of these files exist yet. They're referenced from the code as placeholders
so the real files can be dropped into this folder later with zero code changes.

| File | Spec | Used by |
| --- | --- | --- |
| `gameplay-poster.jpg` | 1200×630 JPG, social share preview + video poster frame | `index.html` (`og:image`, `twitter:image`, JSON-LD `image`/`thumbnailUrl`); `landing-page.component.html` (commented `<video poster>`) |
| `gameplay-teaser.mp4` | Short muted/looping gameplay clip, autoplay-safe (H.264, no audio track needed) | `index.html` (JSON-LD `contentUrl`); `landing-page.component.html` (commented `<video><source>`) |
| `screenshot-1.jpg` / `-2.jpg` / `-3.jpg` | In-game screenshots for the gallery section | `landing-page.component.html` (commented `<img>` gallery slots) |

## How to add them

1. Drop the files into this folder (`frontend/public/assets/landing/`).
2. In `frontend/src/app/landing/landing-page.component.html`:
   - Delete the `.media-skeleton teaser-skeleton` div and uncomment the `<video>` block above it.
   - Delete the three `.media-skeleton gallery-skeleton` divs and uncomment the three `<img>` tags above them.
3. In `frontend/src/index.html`, set `uploadDate` in the JSON-LD block (currently
   `"TODO-set-real-upload-date-when-recording-exists"`) to the real recording date.

## Why `index.html` uses full `https://playtankarena.com/...` URLs

`og:image`, `twitter:image`, and the JSON-LD `image`/`contentUrl`/`thumbnailUrl` are
fetched server-side by external crawlers (Facebook, Twitter/X, Google) that have no
browser origin to resolve a relative path against — a bare `/assets/...` would just
fail to load in their preview. Those three spots must stay absolute, pointing at the
production domain.

Everything else — the actual `<img>`/`<video src>`/`<video poster>` tags inside
`landing-page.component.html` — already uses relative `assets/landing/...` paths on
purpose, so they resolve correctly against whatever origin is actually serving the
page (`localhost:4200` in dev, the real domain in prod). Don't add the domain there.
