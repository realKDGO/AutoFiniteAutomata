/**
 * apkConfig.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for AutoFA Android APK release metadata.
 *
 * Update this file when a new APK version is published.
 *
 * The downloadUrl uses the /latest/download/ GitHub Releases redirect so the
 * same URL always resolves to the newest release asset — no code change is
 * needed when a new release is published, as long as the APK filename stays
 * "AutoFa.apk".
 *
 * Future: the version and downloadUrl fields are intentionally structured so
 * the planned AutoFA in-app update system can read them without any schema
 * change (§14 / §8 of the v2.4.1 spec).
 */

export const APK_CONFIG = {
  /** Displayed on the /download page and usable by the future update system. */
  version: '1.0.0',

  /**
   * Same-origin proxy endpoint that streams AutoFa.apk with attachment headers.
   */
  downloadUrl: '/api/download-apk',

  /**
   * The /latest/download/ redirect always resolves to the newest GitHub
   * Release asset named "AutoFa.apk", regardless of the version tag.
   * Do NOT switch to a version-pinned URL — that would require a code change
   * for every release.
   */
  githubDownloadUrl:
    'https://github.com/realKDGO/AutoFiniteAutomata/releases/latest/download/AutoFa.apk',

  /** Internal React Router path for the download page. */
  downloadPagePath: '/download',

  /** Public-facing URL (used for display / sharing only — not for navigation). */
  downloadPageUrl: 'https://autofa.vercel.app/download',

  // ── Optional display metadata ─────────────────────────────────────────────
  // Update these alongside `version` when publishing a new release.

  /** Approximate APK size shown on the download page. */
  apkSize: '8 MB',

  /** Human-readable date of the latest release. */
  lastUpdated: 'August 2026',

  /**
   * "What's New" bullets shown on the download page.
   * Keep entries short — they render as a simple list.
   */
  whatsNew: [
    'Initial Android release',
    'Full Builder, Generator, and Simulation support',
    'Dark mode and mobile-optimised layout',
  ],
};

/**
 * The version of the currently installed AutoFA APK.
 * This is the single authoritative version constant used by the update system.
 * Update APK_CONFIG.version above when publishing a new release — this export
 * reflects that value automatically so there is no risk of them drifting apart.
 */
export const CURRENT_APP_VERSION = APK_CONFIG.version;
