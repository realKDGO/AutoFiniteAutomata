# Android browser → AutoFA app launching (App Links)

This note documents the **one-time, manual setup** required outside this
repository for the "open the installed AutoFA app instead of staying in the
browser" behavior (see `client/src/lib/platform.js#openMedianApp` and
`client/src/components/InstallAppBanner.jsx`) to actually work on a real
device. None of this can be done from the web app's source alone — the
Android app itself is built and signed by Median (median.co), and its
`AndroidManifest.xml` isn't part of this repository.

## Why the intent launch doesn't work yet

`co.median.android.AppLinksActivity` currently has **no intent-filter** in
the built APK. That means an `intent://…#Intent;package=co.median.android.jbjpjqx;…;end`
URL fired from the browser has nothing to resolve to, regardless of how the
intent URI itself is constructed — per Android's own resolution rules,
`package=` only routes to a component that already declares a matching
`<intent-filter>`. Median generates that intent-filter automatically, but
only once **Link Handling / App Links is configured for this domain in
Median App Studio.**

## Required steps (Median App Studio dashboard)

1. In Median App Studio, open **Link Handling → App Links** (or the
   equivalent "Universal/App Links" section) for the AutoFA app
   (package `co.median.android.jbjpjqx`).
2. Add the production domain the app is served from (e.g.
   `autofa.vercel.app`) and enable App Link verification / "open links in
   app".
3. Rebuild and republish the Android app. This is what actually adds the
   `autoVerify="true"` intent-filter to `AppLinksActivity` for that domain —
   there is no way to add it by hand-editing files in this repo.

## Required step (this repo — already done, but needs a real value)

Android App Links verification requires a Digital Asset Links file hosted
at:

```
https://<your-domain>/.well-known/assetlinks.json
```

That file now exists at `client/public/.well-known/assetlinks.json` (Vite
copies `public/` to the build output root, so it's served as a static file
at that exact path — Vercel serves it directly rather than falling through
to the SPA rewrite in `vercel.json`, since a matching static file always
wins over a rewrite).

**It still contains a placeholder** —
`sha256_cert_fingerprints: ["REPLACE_WITH_APP_SIGNING_SHA256_FINGERPRINT"]`.
Replace it with the real fingerprint from Median App Studio's **App
Signing** section (Android Build & Deployment) before the App Links
configuration above can verify successfully. You can confirm the file is
correctly formatted and reachable with Google's [Statement List Generator
and Tester](https://developers.google.com/digital-asset-links/tools/generator),
or Median's own Deep Linking Validator.

## What already works from the web side (no further setup needed)

- `openMedianApp()` fires the intent launch attempt only on an Android
  mobile browser tab (never inside the Median APK, never on desktop/iOS),
  and only once per browser session (`sessionStorage` guard) — so it can't
  loop.
- `InstallAppBanner` waits up to 2.5s for `visibilitychange` after firing
  the intent. If the tab is backgrounded (app opened), the banner never
  renders. If the timeout elapses with the tab still visible (app not
  installed, or the launch silently failed), the banner renders normally
  and `/download` remains reachable.

Once the two steps above are done and a new APK build is published, no
further web-side code change should be needed.
