/**
 * platform.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for "what shell is AutoFA running in right now".
 *
 * Keeps Android/Median/iOS detection, the install-prompt destination, and the
 * dismissal storage key all in one place so nothing has to re-implement (or
 * drift out of sync with) this logic elsewhere in the app.
 *
 * Every function here is defensive: browser/device detection failing, or
 * LocalStorage being unavailable (private browsing, embedded WebViews with
 * storage disabled, etc.), must never throw and must never block the rest of
 * AutoFA — it should just fall back to "normal website" behavior.
 */

import { APK_CONFIG } from '../apkConfig';

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Where the "Install AutoFA" button sends the user. Defaults to the
 * AutoFA /download page (configured in apkConfig.js). Can be overridden
 * via the VITE_ANDROID_APP_INSTALL_URL env var without touching detection
 * logic — e.g. to point to a Play Store listing in the future.
 */
export const ANDROID_APP_INSTALL_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ANDROID_APP_INSTALL_URL) ||
  APK_CONFIG.downloadPagePath;

/** Dedicated LocalStorage key — never reuses/collides with automaton, save/load,
 *  simulation-history, or settings keys (see §3). */
export const INSTALL_DISMISSED_KEY = 'autofa_app_install_dismissed';

// ─────────────────────────────────────────────────────────────────────────────
// Low-level environment reads (all guarded — never throw)
// ─────────────────────────────────────────────────────────────────────────────

function safeUserAgent() {
  try {
    return window?.navigator?.userAgent ?? '';
  } catch {
    return '';
  }
}

function safeMatchMedia(query) {
  try {
    return window.matchMedia?.(query)?.matches ?? false;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Median (native APK wrapper) detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Median (median.co, formerly GoNative) apps expose a JS bridge object on
 * `window` once the WebView shell has initialized, and/or identify
 * themselves in the UA string. Checking both means we still recognize the
 * APK shell even if one signal is stripped/delayed by a given WebView.
 *
 * This is the ONE place that knows how to recognize "we are already inside
 * the AutoFA Android app" — every other piece of install-prompt logic goes
 * through this function rather than re-deriving it.
 */
export function isMedianApp() {
  try {
    if (typeof window === 'undefined') return false;
    // Median's native bridge — present once the wrapped app has loaded.
    if (window.median || window.Median || window.gonative) return true;
    // Fallback UA signal some Median builds add to their WebView UA string.
    return /median|gonative/i.test(safeUserAgent());
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Device / browser detection
// ─────────────────────────────────────────────────────────────────────────────

/** True on any Android device (browser OR the Median APK — callers combine
 *  this with isMedianApp() themselves; kept orthogonal on purpose). */
export function isAndroid() {
  return /android/i.test(safeUserAgent());
}

/** True on iPhone/iPad/iPod, including iPadOS 13+ which reports as "Mac"
 *  in the UA but exposes touch support — that combination is what
 *  distinguishes an iPad from an actual Mac. */
export function isIOS() {
  const ua = safeUserAgent();
  if (/iphone|ipad|ipod/i.test(ua)) return true;
  try {
    return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  } catch {
    return false;
  }
}

/** Coarse-pointer/touch-first check — deliberately NOT a screen-width check
 *  (§1: "do not rely on screen width alone"), so a resized desktop browser
 *  window never mistakenly counts as "mobile". */
export function isTouchPrimary() {
  return safeMatchMedia('(pointer: coarse)');
}

/**
 * True on desktop browsers (not Android, not iOS/iPadOS, not Median APK).
 */
export function isDesktopBrowser() {
  return !isAndroid() && !isIOS() && !isMedianApp();
}

/**
 * True only for "Android device, in an ordinary mobile browser tab, NOT
 * already inside the Median APK" — exactly the audience §1 specifies for
 * the install recommendation.
 */
export function isAndroidMobileBrowser() {
  return isAndroid() && isTouchPrimary() && !isMedianApp();
}

// ─────────────────────────────────────────────────────────────────────────────
// Median Native Bridge Integration (Median.co / GoNative)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Downloads a file using the Median native bridge if available.
 * 
 * Supports callback/listeners if provided by Median native bridge, and
 * returns a boolean or response indicating whether the native download started.
 *
 * @param {Object} options
 * @param {string} options.url - Absolute URL of the file to download
 * @param {string} [options.filename] - Target filename
 * @param {boolean} [options.open] - Whether to immediately prompt to open/install
 * @param {Function} [options.callback] - Optional completion/status callback
 * @returns {boolean}
 */
export function medianDownloadFile(options) {
  try {
    if (typeof window === 'undefined') return false;
    const { url, filename = 'AutoFa.apk', open = false, callback } = options || {};
    if (!url) return false;

    // Check window.median.downloads or window.gonative.downloads
    const bridge = window.median || window.Median || window.gonative;

    if (bridge?.downloads?.downloadFile) {
      bridge.downloads.downloadFile({ url, filename, open, callback });
      return true;
    }

    if (typeof bridge?.downloadFile === 'function') {
      bridge.downloadFile({ url, filename, open, callback });
      return true;
    }

    // Median URL scheme bridge fallback (gonative://downloads/downloadFile)
    if (isMedianApp()) {
      const params = new URLSearchParams();
      params.set('url', url);
      if (filename) params.set('filename', filename);
      if (open) params.set('open', 'true');
      window.location.href = `gonative://downloads/downloadFile?${params.toString()}`;
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Opens an already-downloaded local file/URI/path or local reference via Median native bridge.
 * Android package installer requires FileProvider/content URI handling which Median's openFile /
 * downloads.openFile handles natively without re-downloading.
 *
 * @param {Object} options
 * @param {string} [options.uri] - Local content URI or file path returned after download
 * @param {string} [options.url] - URL or reference of the downloaded file
 * @param {string} [options.filename] - Filename on device
 * @returns {boolean}
 */
export function medianOpenFile(options) {
  try {
    if (typeof window === 'undefined') return false;
    const { uri, url, filename = 'AutoFa.apk' } = options || {};
    const target = uri || url;
    if (!target) return false;

    const bridge = window.median || window.Median || window.gonative;

    if (bridge?.downloads?.openFile) {
      bridge.downloads.openFile({ uri: target, url: target, filename });
      return true;
    }

    if (typeof bridge?.openFile === 'function') {
      bridge.openFile({ uri: target, url: target, filename });
      return true;
    }

    // Median URL scheme bridge fallback (gonative://downloads/openFile)
    if (isMedianApp()) {
      const params = new URLSearchParams();
      params.set('url', target);
      if (filename) params.set('filename', filename);
      window.location.href = `gonative://downloads/openFile?${params.toString()}`;
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Attempts to open the AutoFA Android app from a mobile browser using Android Intent / App Links.
 * Only attempts once per session to prevent infinite redirect loops.
 *
 * @returns {boolean} True if the launch attempt was triggered
 */
export function openMedianApp() {
  try {
    if (typeof window === 'undefined') return false;
    if (!isAndroidMobileBrowser()) return false;

    // Guard against repeated attempts or redirect loops in the current session.
    if (sessionStorage.getItem('autofa_app_launch_attempted') === '1') {
      return false;
    }
    sessionStorage.setItem('autofa_app_launch_attempted', '1');

    // Android Intent URI — targets the installed AutoFA APK by package ID.
    // On Chrome for Android, window.location.href with an intent:// URL hands
    // control to the Android OS intent dispatcher. If the app is installed the
    // OS switches to it and the page becomes hidden (visibilitychange fires).
    // If the app is not installed, Chrome shows a system error and the page
    // stays visible. The caller (InstallAppBanner) uses the Page Visibility
    // API to determine which outcome occurred.
    const intentUrl =
      'intent://autofa.vercel.app/#Intent;scheme=https;package=co.median.android.jbjpjqx;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end';

    window.location.href = intentUrl;
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Install-prompt eligibility + dismissal persistence
// ─────────────────────────────────────────────────────────────────────────────

function readLocalStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Private-mode Safari, storage disabled, embedded WebView restrictions...
    // Treat as "not dismissed" rather than crash (§21).
    return null;
  }
}

function writeLocalStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function isInstallPromptDismissed() {
  return readLocalStorage(INSTALL_DISMISSED_KEY) === '1';
}

export function dismissInstallPrompt() {
  writeLocalStorage(INSTALL_DISMISSED_KEY, '1');
}

/**
 * Single entry point the UI should call: "should the install recommendation
 * render right now?" Folds together platform eligibility + prior dismissal
 * so AppLayout doesn't need to know the individual rules.
 *
 * Desktop browsers and Median APK never show the install prompt.
 * Only Android mobile browsers that have not dismissed it are eligible.
 */
export function shouldShowInstallPrompt() {
  try {
    if (isMedianApp() || isIOS() || isDesktopBrowser()) return false;
    if (isInstallPromptDismissed()) return false;
    return isAndroidMobileBrowser();
  } catch {
    // Detection failure of any kind → default to NOT showing the prompt,
    // i.e. normal website behavior.
    return false;
  }
}
