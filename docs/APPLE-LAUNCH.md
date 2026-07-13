# Apple App Store launch roadmap — MSC Backcountry Bulletin

Written 2026-07-13. Goal: turn the working PWA into an App Store app that
could be gifted to Mountain Safety Collective, published under their name.

## The right ownership model (important for the gift)

The app uses MSC's name, logo and report format. Apple's rules (Guideline
4.1/5.2 — impersonation & intellectual property) mean **the App Store
listing must be published by, or with written authorisation from, MSC**.
That's not a blocker — it's the pitch: hand MSC a finished app and offer to
run it as their technical lead.

- Best path: MSC enrols in the **Apple Developer Program as an
  organisation** (needs their ABN → D-U-N-S number, ~1–2 weeks; AUD $149/yr).
  Apple can waive the fee for nonprofits in some regions — worth MSC asking.
- Interim path: publish nothing; demo via the PWA + TestFlight from a
  personal account with MSC's written OK.

## Technical path: wrap, don't rewrite

The app is a self-contained web bundle — the fastest respectable route to
the App Store is **Capacitor** (native shell around the existing code) with
a few native capabilities added so it clears **Guideline 4.2 (minimum
functionality)** — Apple rejects bare website wrappers, so add:

1. **Push notifications** (APNs): "Forecast updated", "Danger rating raised"
   — the single most valuable native feature for a safety app.
2. **Offline-first** (already built — service worker → Capacitor asset
   bundle makes it stronger).
3. **Haptics** on danger-rating interactions; native share sheet (already
   using Web Share, maps 1:1).
4. Optional later: widgets (today's day score on the home screen), watchOS
   glance, Live Activities during storm cycles.

Requirements on the Mac: Xcode (free, ~12 GB — works on the 2019 Intel MBP
on Sequoia), CocoaPods, an Apple Developer account for device builds.

## App Review checklist (the rules that bite)

| Guideline | What it means for this app | Status / to-do |
|---|---|---|
| 4.2 Minimum functionality | Not just a wrapped site | Add push + haptics via Capacitor |
| 5.1.1 Privacy policy | Public privacy policy URL required | Write one (data is on-device; easy story) |
| 5.1.1(v) Account deletion | In-app account/data deletion | ✅ Built (Account → Delete all my data) |
| 4.8 Sign in with Apple | Only if third-party social login is offered | N/A — first-party login only |
| 5.2 IP / 4.1 Impersonation | MSC authorisation to use name/logo | Get written OK / publish as MSC |
| 1.4 Physical harm | Safety info must not be recklessly wrong | Keep "always read the official report" framing, sample-data badges |
| 2.1 Completeness | No demo/placeholder content in review build | Ship with live API data, not sample |
| App Privacy labels | Declare data collection | "Data not collected" if backend stays minimal |

## Backend for real multi-user accounts

Static PWA today = accounts are on-device. For forecaster publishing that
reaches everyone + observer data flowing to MSC:

- **Supabase free tier** (Postgres + auth + row-level security) or a
  **FastAPI service on Fly.io** (same stack as the Thredbo wait-time
  monitor). Either slots in behind `store.js`'s adapter without touching
  the views.
- MSC already run their own API (api.mountainsafetycollective.org, an
  admin-authenticated report CMS) — the real gift-integration is the app
  reading their existing API directly, which the app already attempts on
  launch with graceful fallback.

## App Store assets needed at submission

- 6.7" + 6.1" iPhone screenshots (the verify harness already produces
  device-accurate captures), app icon 1024px (have 512 — regenerate at
  1024), description, keywords, support URL, marketing URL (their site),
  age rating questionnaire (4+), privacy policy URL.

## Suggested sequence

1. Zac demos PWA to MSC (it's live now).
2. MSC gives written blessing → repo transferred or licensed.
3. Capacitor wrap + push notifications (1–2 weekends of work).
4. MSC D-U-N-S + Developer enrolment in parallel.
5. TestFlight beta to MSC forecasters/observers.
6. App Review submission under MSC's account.
