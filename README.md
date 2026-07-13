# MSC — Backcountry Bulletin (iPhone app)

An installable iPhone app (PWA) recreating the Mountain Safety Collective
experience — mountainsafetycollective.org — built to avalanche-app UX best
practice. Personal-use project; not affiliated with MSC.

**Live:** https://hucknife-gif.github.io/msc-app/

## What's in it

Five tabs, bottom navigation, offline-first. Light theme (white + MSC red)
by default with a dark-mode toggle. Accounts with roles: **forecaster**
(edit/publish the forecast with an update badge, customise app modules and
accent) and **observer** (CAA-convention snow-profile field data entry).
Danger ratings presented MSC-style: split alpine/subalpine mountain graphic
with per-band score banners; numbered hazard cards with elevation triangle,
petal aspect rose, and size/likelihood gauges. Security: CSP, hashed demo
credentials, 12 h session expiry, same-origin service-worker cache, all
dynamic content HTML-escaped. See docs/APPLE-LAUNCH.md for the App Store
roadmap.

- **Today** — day score hero (Usual Caution / Extra Caution / Travel Not
  Recommended), region toggle (NSW Main Range / VIC Dividing Range), four
  hazard categories (Exposure, Visibility, Surface, Avalanche), outlook,
  weather snapshot, quick links. `SOS` pill in the header from every screen.
- **Report** — full conditions report: Danger rating / Hazards / Details
  tabs, Alpine + Subalpine elevation bands, travel & terrain advice.
- **Observe** — link to MSC's official observation form + a local draft
  form (autosaves to the phone, shares via the iOS share sheet).
- **Learn** — a full curriculum built on current CAA/Avalanche Canada
  doctrine adapted to Australian risks: the nine avalanche problems, terrain
  reading (angle / traps / ATES v2), wind + cornices, decision-making
  (daily process, FACETS human factors), the 10-minute companion-rescue
  doctrine, and a century of Australian case studies — with inline SVG
  diagrams (offline-safe) and tap-to-answer practice quizzes per article.
  Plus the MSC YouTube video library: seeded from their verified channel,
  embedded in-app via youtube-nocookie, forecasters can add/remove videos.
- **Safety** — call-000 card, rescue-call script, companion-rescue steps,
  trip intention forms (NSW/VIC), MSC links.

Report content is **original sample data** (badged "Sample data" in-app).
The app pings MSC's public report API on launch and shows a "Live" badge
when reachable; mapping real report fields is a follow-up once the API
response schema is confirmed.

## Install on iPhone

### Option A — same Wi-Fi as the Mac (quickest)
1. On the Mac: `./scripts/serve.sh` (serves on port 8642).
2. On the iPhone, open Safari → `http://<mac-ip>:8642` (the script prints it).
3. Share button → **Add to Home Screen** → Add.

It launches full-screen from the home screen. Note: over plain HTTP the
service worker can't register, so offline mode is disabled — the app needs
the Mac server reachable. For full offline, use Option B.

### Option B — public hosting (full offline PWA)
`./scripts/deploy.sh` pushes the `app/` folder to a GitHub Pages branch.
**Not run automatically** — creates a public repo/URL, so it's your call.
Once on HTTPS, the service worker caches everything and the app works with
zero reception in the backcountry.

## Development

- No build step. `app/` is plain HTML/CSS/JS.
- Verify end-to-end: `./scripts/serve.sh` then `node scripts/verify.js`
  (drives Chrome with iPhone 15 emulation, checks every view for console
  errors, overflow, expected content markers, manifest + SW, and writes
  screenshots to `docs/screens/`).

## Licensing note

MSC's site terms restrict re-serving their report content outside personal
alpine-hazard communication. This app ships sample data and links out to
their real reports; if it ever grows into something distributed, ask MSC
(they already license report embedding to the Skida app, so there's a path).
