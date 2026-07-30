# ADR-004: Progressive Web App Over Native Shell for Mobile Delivery

**Status:** Proposed
**Date:** 2026-07-29
**Author:** Jonathan V Tran
**Deciders:** Jonathan V Tran

---

## Section 1 — Context

Cantera Manager (`nola-dfc-manager`) is a React 19 / Vite 7 single-page application deployed to Vercel and used primarily by coaches, team staff, and parents of a youth soccer club. The dominant real-world usage pattern is mobile: a parent checking their child's balance from a phone, a coach glancing at the schedule from the sideline, a guardian photographing a birth certificate to satisfy a compliance requirement. The application currently ships as a browser-first web app that already includes substantial mobile infrastructure — a hand-authored Web App Manifest (`public/manifest.json`, `display: standalone`, maskable 192/512 icons), a Workbox service worker built via `vite-plugin-pwa` using the `injectManifest` strategy (`public/service-worker.js`), auto-update handling on service-worker activation (`src/registerSW.js`), a full Web Push subscribe/receive/click pipeline (`src/services/pushService.js`, `src/hooks/usePushNotifications.js`), and the iOS standalone meta tags in `index.html`.

The stated goal is to give the application genuine mobile-app characteristics — home-screen presence, push notifications, camera access, offline tolerance — under a hard constraint: **distribution must not go through the Apple App Store or Google Play Store**. The specific technology question raised was whether Capacitor is the right vehicle.

The audience is a small, non-technical, consumer population (team parents) reached by link, not by store search. The data handled includes minors' personal information, guardian contact details, and medical release forms, which raises the sensitivity of any client-side caching decision. There is no in-house native mobile capability on the team, and no existing Xcode or Android Studio toolchain in the repository.

## Section 2 — Decision

We will deliver mobile capability by completing the existing Progressive Web App rather than introducing Capacitor or any other native shell.

The no-app-store constraint is decisive. Capacitor's core function is to produce a signed native binary for store submission; stripping the store from that pipeline removes the value while keeping all of the cost. On iOS specifically there is no legitimate public-distribution path outside the store — TestFlight expires builds every 90 days and still requires review, and the Apple Developer Enterprise Program is contractually limited to an organisation's own employees, which team parents are not. On Android, sideloading an APK is technically possible but forfeits automatic updates, which this application depends on today via the `skipWaiting` / `controllerchange` reload flow. Because every capability actually required — installability, Web Push (iOS 16.4+), camera capture, and offline caching — is available to a PWA on both platforms, the native shell would add two build toolchains and a bespoke update mechanism in exchange for no new capability.

The work is therefore scoped as closing four specific gaps in the existing PWA, introducing one new client-side architectural component: an **Install & Notify layer** that detects platform and display mode, drives the install flow, and gates push opt-in on the conditions under which it can actually succeed.

## Section 3 — Consequences

### Positive consequences

- Zero distribution cost and zero review latency. A change reaches every user on the next page load through the existing Vercel deploy, with no store approval step and no version fragmentation.
- No new build toolchain, no native dependency surface, and no second release pipeline. The existing `vite build` output remains the single artefact.
- Auto-update semantics already implemented in `src/registerSW.js` continue to work unchanged. A sideloaded native build would have required replacing this with a custom updater.
- Fixing the iOS install/push gap (Milestone 1) resolves a currently silent failure: on iOS, Web Push only functions once the app is added to the Home Screen, and Safari never fires `beforeinstallprompt`. Today an iPhone user tapping the push CTA receives no notification and no explanation.
- The cache-partitioning work (Milestone 2) closes a data-exposure path that exists regardless of the mobile decision, so the effort is not contingent on this ADR being accepted.

### Negative consequences / trade-offs

- **No store presence.** The application is not discoverable by search in the App Store or Play Store and carries no store-badge credibility signal. Given that users are onboarded by direct link from team staff, this is judged an acceptable loss, but it is a real one.
- **iOS installation requires a manual, user-driven step.** Safari offers no programmatic install prompt; users must use Share → Add to Home Screen. This must be taught in-app, and some proportion of users will not complete it. Push notification reach on iOS is therefore bounded by install-completion rate, not by permission-grant rate.
- **The Background Sync API is unavailable on iOS.** The offline mutation outbox (Milestone 4) must replay on `online` and `visibilitychange` events rather than relying on the browser to flush the queue while the app is closed. This is a functional workaround, not a full equivalent — a queued mutation will not sync until the user reopens the app.
- **iOS PWA storage is subject to eviction** after extended periods of non-use. The offline cache and outbox must be treated as best-effort, and the application must degrade correctly when they are empty.
- Committing to the PWA path means that if a future requirement genuinely demands a native-only API (Bluetooth peripherals, HealthKit, background geolocation), this decision must be revisited with a new ADR rather than extended.

## Section 4 — Alternatives considered

### Alternative: Capacitor with sideloaded / non-store distribution

**Why it was considered:** It was the specific technology named in the request, and it wraps the existing web build without requiring a rewrite, so the apparent migration cost looks low.
**Why it was rejected:** The distribution model does not exist on iOS for a public audience. TestFlight is a beta channel with 90-day build expiry and review; the Enterprise Program prohibits distribution to non-employees and using it for team parents risks account revocation. On Android, sideloading works but eliminates auto-update, requiring a custom in-app updater to replace functionality the PWA already has for free. In exchange, Capacitor delivers no capability the PWA lacks for this feature set, while adding Xcode and Android Studio toolchains, native plugin version management, and a second release pipeline.

### Alternative: React Native / Expo rewrite

**Why it was considered:** Best-in-class native feel and access to the full native API surface.
**Why it was rejected:** This is a full rewrite of the entire view layer — every screen under `src/views/` and `src/components/` — for an application whose UI is already built and working. It also lands on the same store-distribution wall as Capacitor, so it does not satisfy the stated constraint either. This exceeds the 40% rewrite threshold and would be a high-risk rewrite engagement for no gain against the actual requirement.

### Alternative: Leave the PWA as-is and do nothing

**Why it was considered:** The manifest, service worker, and push pipeline already exist, so the app is nominally installable today.
**Why it was rejected:** "Nominally installable" is not the same as usable. There is no install prompt handling anywhere in `src/` — no `beforeinstallprompt` capture for Android and no Add-to-Home-Screen guidance for iOS — so most users never install, and on iOS never installing means push silently never works. Separately, the current `StaleWhileRevalidate` route on all `/rest/` GETs in `public/service-worker.js` is keyed by URL alone, so authenticated, RLS-filtered responses are cached in shared Cache Storage and survive logout; on a shared device this can serve one user's data to another. Doing nothing leaves both a broken primary flow and an open data-exposure path.

## Section 5 — Implementation milestones

**Milestone 1 — Install & iOS push unblock.** Add a `useInstallPrompt` hook capturing and deferring `beforeinstallprompt`, and a `usePlatform` hook detecting iOS and `display-mode: standalone`. Build an iOS Add-to-Home-Screen coach sheet. Gate the push CTA in `src/components/NotificationPermissionBanner.jsx` and `src/components/DesktopSidebar.jsx` so non-standalone iOS users are prompted to install rather than shown a control that cannot succeed.
_Handoff:_ push opt-in becomes reliable across platforms; unblocks any downstream notification feature.

**Milestone 2 — Cache partitioning and logout purge.** Key the `supabase-rest-v1` cache by authenticated user ID, purge all service-worker caches on Supabase `SIGNED_OUT`, and exclude `medical_forms` and `guardians` endpoints from service-worker caching entirely.
_Handoff:_ offline reads become safe to expand.

**Milestone 3 — Camera capture and mobile upload.** Add `accept="image/*"` and `capture="environment"` to the document inputs in `src/views/team/DocumentManager.jsx` and `src/views/team/ParentView.jsx`; downscale images client-side before upload to Supabase Storage to respect cellular data limits.
_Handoff:_ the highest-frequency mobile action (photographing a compliance document) works end-to-end.

**Milestone 4 — Offline mutation outbox.** IndexedDB-backed queue for writes made while offline, replayed on `online` and `visibilitychange`, with a pending-sync indicator in the UI.
_Handoff:_ the app stops being read-only offline.

**Milestone 5 — Manifest polish.** Add `shortcuts` for Schedule, Roster, and Ledger; reconsider the hard `orientation: portrait` lock, which currently also applies to installed tablet and desktop contexts.
