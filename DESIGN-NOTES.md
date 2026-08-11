# Design notes — de-slop pass 2026-08-11

Read this before any future visual pass.

## Aesthetic direction

**Apple Weather structure, MSC bulletin voice.** Content sits directly on the
background — no card chrome. One dominant full-bleed day-score hero (the "sky":
score-colour gradient fading into the page background, topo-contour texture,
two-tone Main Range ridgeline silhouette = the single signature element).
Below the hero, information shrinks as it gets less important: bare typographic
hazard rows, hairline-divided sections, Stocks-style big numerals for weather
stats, edge-to-edge charts, settings-style link rows.

Type stays Barlow / Barlow Condensed (self-hosted) + mono for field-note
metadata — that family IS the app's voice; don't swap it.

## AI tells found (v3) → fixed (v4)

- **Card chrome everywhere** (white bordered rounded glass boxes + shadows on a
  tinted gradient background — the #1 "mega AI" tell). → `.card` is now
  chrome-less; tappable cards became hairline-divided rows; kv cells became big
  bare numerals over hairlines; hazard chips are bare rows keeping only the
  4px severity key-line.
- **Boxed hero** (bordered rounded card) → full-bleed sky hero, score type up
  to 52–68px, `text-wrap: balance`.
- **Boxed segmented control** → text tabs with red underline
  (`div.seg[role="group"]` — deliberately scoped so the Tours pill `.seg`
  buttons are untouched).
- **Pill badges with tinted backgrounds** (LIVE/SAMPLE/UPDATE) → plain
  dot + mono text, colours kept (they're status data).
- **Dark plate headers on hazard cards** → typographic entries: big red
  condensed number + condensed name over a hairline.
- **Tinted gradient page background** → flat paper `#fbfcfc` / flat alpine
  night `#0b1826`.
- Bordered circle header buttons → borderless with hover wash; added hover
  states for buttons/quiz options.

## Do not touch

- Danger-ramp colours (`--dgr-*`), day-score colours, split-triangle /
  score-banner / aspect-rose colours — internationally standardised hazard
  semantics. Style around them, never restyle them.
- The 4 access tiers, archive and admin logic (all JS) — this pass was
  CSS-only apart from the `sw.js` cache bump (`msc-v8`); bump it again on any
  asset change or iPhones keep the stale cache.
- MSC logo lockup keeps its dark plate on light theme (the lockup subtext is
  white).

## Verification

- `python3 scripts/ui_shot.py before|after` → `docs/design-pass/*.png`
  (375 + 1440, light + dark; playwright, own chromium, `reduced_motion=reduce`
  or the entry animation blanks full-page captures).
- `node scripts/verify.js` (functional harness) passed after the pass.
- Full-page captures render the fixed tabbar mid-page — that's a capture
  artifact, not a layout bug.
