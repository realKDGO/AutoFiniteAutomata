/**
 * githubReleaseService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Resolves AutoFA's "latest available release" from the GitHub Releases API
 * instead of hard-coded values, so publishing a new GitHub Release is the
 * only step needed to notify users — including the release's own patch
 * notes, which flow straight into the Update Modal's "What's New" section
 * and the /download page (v2.4.3 spec).
 *
 * - Uses the official Releases API (`/releases/latest`), never HTML scraping.
 * - Normalizes the `vX.Y.Z` tag into a plain `X.Y.Z` string.
 * - Caches the full release payload for a few minutes so every
 *   `/api/version` request doesn't hit GitHub, and so the client never
 *   needs to call GitHub itself.
 * - On any failure (network, rate limit, malformed tag), falls back to the
 *   last known-good cached release, or — if there's never been one — to a
 *   minimal fallback release whose version intentionally equals AutoFA's
 *   own current version, so a lookup failure can never fabricate a false
 *   "update available" notification. The real error is always logged.
 */

const GITHUB_REPO = 'realKDGO/AutoFiniteAutomata';
const GITHUB_LATEST_RELEASE_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

// The APK filename/asset is stable across releases, so this URL always
// resolves to whatever the latest release's asset is — no version-pinned
// URL, no code change needed per release (§6/§7 of the v2.4.3 spec).
const GITHUB_APK_DOWNLOAD_URL = `https://github.com/${GITHUB_REPO}/releases/latest/download/AutoFa.apk`;

// A few minutes, per spec §10 — short enough that a new release reaches
// users promptly, long enough to avoid hammering GitHub on every page load.
// `let`, not `const`, only so tests can shrink it to force expiry deterministically.
let CACHE_TTL_MS = 5 * 60 * 1000;

// Mirrors the client's CURRENT_APP_VERSION (client/src/apkConfig.js). Kept
// as a plain literal here (rather than importing across the client/server
// boundary) — update both together when AutoFA's own baseline version
// changes. This is ONLY used when GitHub has never successfully responded,
// so drift between the two is low-stakes: worst case is one missed update
// check, never a false positive.
const FALLBACK_VERSION = '1.0.0';

let cache = { release: null, fetchedAt: 0 };

/** `v1.2.3` / `1.2.3` / `V1.2.3` → `1.2.3`. Returns null if the tag doesn't
 *  look like a version at all, so callers can treat it as a failed lookup
 *  rather than caching garbage. Exported for testing. */
export function normalizeVersionTag(tag) {
  if (typeof tag !== 'string') return null;
  const cleaned = tag.trim().replace(/^v/i, '');
  return /^\d+(\.\d+){0,2}/.test(cleaned) ? cleaned : null;
}

function isCacheFresh(now) {
  return cache.release !== null && now - cache.fetchedAt < CACHE_TTL_MS;
}

function fallbackRelease() {
  // Prefer the last known-good release (stale-but-real) over the hard-coded
  // fallback — a temporary GitHub outage shouldn't wipe out release notes
  // users already saw a minute ago.
  if (cache.release) return cache.release;
  return {
    version: FALLBACK_VERSION,
    releaseName: null,
    releaseDate: null,
    releaseNotes: null,
    downloadUrl: GITHUB_APK_DOWNLOAD_URL,
  };
}

/**
 * Returns the latest AutoFA release, normalized into the shape the API/UI
 * needs: { version, releaseName, releaseDate, releaseNotes, downloadUrl }.
 * Never throws — always resolves to a usable object.
 */
export async function getLatestRelease() {
  const now = Date.now();
  if (isCacheFresh(now)) return cache.release;

  try {
    const response = await fetch(GITHUB_LATEST_RELEASE_API, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'AutoFA-Server',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub Releases API responded with ${response.status}`);
    }

    const data = await response.json();
    const version = normalizeVersionTag(data?.tag_name);
    if (!version) {
      throw new Error(`Latest GitHub release has an unrecognized tag_name: ${JSON.stringify(data?.tag_name)}`);
    }

    const release = {
      version,
      releaseName: typeof data?.name === 'string' && data.name.trim() ? data.name.trim() : null,
      releaseDate: data?.published_at ?? null,
      releaseNotes: typeof data?.body === 'string' && data.body.trim() ? data.body.trim() : null,
      downloadUrl: GITHUB_APK_DOWNLOAD_URL,
    };

    cache = { release, fetchedAt: now };
    return release;
  } catch (err) {
    // Never crash the API and never invent a fake newer version (§7/§11) —
    // log for debugging, then fall back to the last known-good value.
    console.error('[githubReleaseService] Failed to resolve latest GitHub release:', err.message);
    return fallbackRelease();
  }
}

/** Convenience accessor for callers that only need the version string. */
export async function getLatestReleaseVersion() {
  const release = await getLatestRelease();
  return release.version;
}

/** Test-only: clears the in-memory cache so tests can exercise both a fresh
 *  fetch and the fallback path without waiting out the real TTL. Not used
 *  by any production code path. */
export function __resetCacheForTests() {
  cache = { release: null, fetchedAt: 0 };
}

/** Test-only: overrides the cache TTL so tests can force expiry
 *  deterministically instead of waiting out the real 5-minute window. */
export function __setCacheTtlForTests(ms) {
  CACHE_TTL_MS = ms;
}
