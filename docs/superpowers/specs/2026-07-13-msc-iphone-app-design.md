# MSC iPhone App — Design Doc (2026-07-13)

## Goal
A fully launchable iPhone app recreating the Mountain Safety Collective
(mountainsafetycollective.org) experience, built to avalanche/outdoor-app UX
best practice, with quick-access safety information end to end.

## Key constraint → platform decision
**No Xcode on this Mac** (Command Line Tools only, no /Applications/Xcode.app),
non-admin account, no Apple Developer account. A native SwiftUI app could not
be built, verified, or installed on a phone from here.

**Decision: installable PWA (Progressive Web App).**
- Launches from the iPhone home screen full-screen (standalone display mode)
- Offline-capable via service worker (critical for backcountry use — genuine
  best practice for avalanche apps: NWAC/Avalanche Canada emphasise offline)
- Zero cost, no accounts, installable today
- Alternatives considered: SwiftUI (blocked — no Xcode), Expo/React Native
  (requires dev server running on the Mac every launch, or paid EAS cloud
  builds). PWA wins on "fully launchable end-to-end".

## App structure (avalanche-app best practice)
Bottom tab bar, 5 tabs (iOS HIG):
1. **Today** — dashboard: current danger rating hero card (danger scale
   colours), region selector (NSW Main Range / Victorian Alps), key advisory
   summary, weather snapshot, quick links
2. **Advisory** — full condition report: danger by elevation band, avalanche
   problems, snowpack discussion, weather, travel advice
3. **Observations** — recent field observations feed + submit form (stored
   locally, mailto/export)
4. **Learn** — education content: danger scale explainer, trip planning
   checklist, gear list, avalanche problem types
5. **Emergency** — quick-access: 000, Triple Zero guidance, companion-rescue
   steps, emergency beacon info, grid-reference helper. Reachable in ≤2 taps
   from anywhere (also a persistent SOS affordance on Today).

## Design system
- **Danger-scale colours reserved for ratings only** (international standard):
  Low #52A427, Moderate #FFF300, Considerable #F79218, High #EF1C29,
  Extreme #231F20 (red/black chequer). Never reused as UI chrome.
- Base UI: alpine dark theme (deep slate/navy), high contrast for outdoor
  glare readability, large type, 44pt+ touch targets
- Typography: system font stack (SF Pro on iOS) for native feel + fast load;
  display weight for danger ratings
- SVG icons only (inline, Lucide-style strokes), no emoji icons
- Offline-first: all content bundled; service worker caches app shell;
  "last updated" timestamps everywhere (stale-data honesty is a safety
  requirement in this domain)

## Data
Static content bundled as JSON, modelled on MSC's real structure (regions,
report sections, education topics) — sample advisory content clearly marked
as demo. Live-fetch hook stubbed for future integration (MSC reports are
member-gated; no public API).

## Hosting / install path
Local: `npx serve` or python http.server on the Mac → iPhone installs over
LAN. Public (optional, Zac's call — not done without approval): GitHub Pages
deploy script included (`deploy.sh`). HTTPS hosting enables the service
worker/offline mode; a LAN-HTTP install works but without offline caching.

## Verification
- Build is static (no build step) — verified by serving locally + automated
  checks: HTML validity, manifest lint, SW registration, Lighthouse-style
  manual checklist, screenshots via headless Chrome at iPhone viewport.

## Not doing (YAGNI)
- Accounts/membership auth, payments, push notifications, native wrappers,
  live MSC scraping (member-gated; injection risk), map tiles (heavy; linked
  out instead).
