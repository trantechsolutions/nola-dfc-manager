# ADR-005: Capacitor Native Shell Alongside the PWA

**Status:** Accepted
**Date:** 2026-10-25
**Author:** Jonathan V Tran
**Deciders:** Jonathan V Tran
**Supersedes:** ADR-004

---

## Section 1 — Context

ADR-004 rejected Capacitor because distribution had to avoid the App Store and Play Store. That constraint is lifted: the app is going to ship as a store-distributed iOS and Android app built with Capacitor. The PWA stays the primary delivery for the web, and the same `vite build` output is the web bundle inside the shell.

## Section 2 — Decision

Wrap the existing Vite build in Capacitor 8. One codebase, one bundle; anything that must behave differently inside the shell goes through `src/native/` and never sniffs the user agent.

- `src/native/platform.js` — `isNative`, `nativePlatform`, `publicOrigin()` (shareable links use the real web address, not `capacitor://localhost`), `authRedirectUrl()` and the `com.canteramanager.app://auth-callback` deep link.
- `src/native/index.js` — `initNative()`: deep-link routing (auth callbacks and app links), Android back button, `native` / `native-<platform>` classes on `<html>`; `openAuthUrl()` opens OAuth in the system browser sheet.
- `src/main.jsx` — the shell skips the service worker; updates arrive through the stores.
- Auth stays on the implicit flow: the callback's hash is put on the page's own URL and the page reloads, so the browser's session and recovery-link handling runs unchanged.

## Section 3 — Consequences

- Two native toolchains (Android Studio; Xcode on macOS for iOS) and a store release pipeline now exist next to the Vercel deploy.
- A web change reaches native users only after `npm run cap:sync` and a store release, unless live updates are added later.
- Supabase Auth's redirect allow-list must include `com.canteramanager.app://auth-callback`.
- Web Push does not work inside the shell, so the app registers FCM tokens (`device_tokens`) and `notify-push` sends to them as well as to browsers. iOS is delivered through FCM to APNs.
- Notifications are now queued and sent by the database rather than the sender's client (`sql/notifications_migration.sql`): chat via trigger, reminders via pg_cron, retries via a sweep, with per-device delivery records.

## Section 4 — Milestones

1. **Scaffold (done)** — Capacitor deps, `capacitor.config.json`, `src/native/`, auth deep link, `publicOrigin()` for shared links, `cap:*` scripts.
2. **Platforms** — `npx cap add android` / `npx cap add ios`; register the URL scheme and app links (`assetlinks.json`, `apple-app-site-association` served from the app domain); icons and splash.
3. **Native push (code done)** — `@capacitor-firebase/messaging`, `src/native/push.js`, `device_tokens`, FCM HTTP v1 in `supabase/functions/notify-push/fcm.ts`. Remaining setup:
   - Create a Firebase project; add the Android app (`com.canteramanager.app`) and the iOS app (same bundle id).
   - Put `google-services.json` in `android/app/` and `GoogleService-Info.plist` in `ios/App/App/` after `cap add`.
   - iOS: enable the Push Notifications and Background Modes → Remote notifications capabilities; upload an APNs auth key (.p8) under Firebase → Project settings → Cloud Messaging.
   - Create a service account with the Firebase Cloud Messaging API Admin role and run `supabase secrets set FCM_SERVICE_ACCOUNT="$(cat key.json)"`.
4. **Native polish** — status bar colour per theme, camera via `@capacitor/camera` for document capture, haptics.
5. **Release** — signing, store listings, privacy labels (minors' data), CI build.
