/**
 * githubReleaseService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Resolves AutoFA's "latest available version" from the GitHub Releases API
 * instead of a hard-coded value, so publishing a new GitHub Release is the
 * only step needed to notify users (see UpdateModal / v2.4.2 spec).
 *
 * - Uses the official Releases API (`/releases/latest`), never HTML scraping.
 * - Normalizes the `vX.Y.Z` tag into a plain `X.Y.Z` string.
 * - Caches the result for a few minutes so every `/api/version` request
 *   doesn't hit GitHub, and so the client never needs to call GitHub itself.
 * - On any failure (network, rate limit, malformed tag), falls back to the
 *   last known-good cached version, or — if there's never been one — to
 *   FALLBACK_VERSION, which intentionally equals AutoFA's own current
 *   version so a lookup failure can never fabricate a false "update
 *   available" notification. The real error is logged either way.
 */

const GITHUB_REPO = 'realKDGO/AutoFiniteAutomata';
const GITHUB_LATEST_RELEASE_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

// A few minutes, per spec §10 — short enough that a new release reaches
// users promptly, long enough to avoid hammering GitHub on every page load.
const CACHE_TTL_MS = 5 * 60 * 1000;

// Mirrors the client's CURRENT_APP_VERSION (client/src/apkConfig.js). Kept
// as a plain literal here (rather than importing across the client/server
// boundary) — update both together when AutoFA's own baseline version
// changes. This is ONLY used when GitHub has never successfully responded,
// so drift between the two is low-stakes: worst case is one missed update
// check, never a false positive.
const FALLBACK_VERSION = '1.0.0';

let cache = { version: null, fetchedAt: 0 };

/** `v1.2.3` / `1.2.3` / `V1.2.3` → `1.2.3`. Returns null if the tag doesn't
 *  look like a version at all, so callers can treat it as a failed lookup
 *  rather than caching garbage. Exported for testing. */
export function normalizeVersionTag(tag) {
  if (typeof tag !== 'string') return null;
  const cleaned = tag.trim().replace(/^v/i, '');
  return /^\d+(\.\d+){0,2}/.test(cleaned) ? cleaned : null;
}

function isCacheFresh(now) {
  return cache.version !== null && now - cache.fetchedAt < CACHE_TTL_MS;
}

/**
 * Returns the latest AutoFA version as a normalized `X.Y.Z` string.
 * Never throws — always resolves to a usable version string.
 */
export async function getLatestReleaseVersion() {
  const now = Date.now();
  if (isCacheFresh(now)) return cache.version;

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

    const release = await response.json();
    const normalized = normalizeVersionTag(release?.tag_name);
    if (!normalized) {
      throw new Error(`Latest GitHub release has an unrecognized tag_name: ${JSON.stringify(release?.tag_name)}`);
    }

    cache = { version: normalized, fetchedAt: now };
    return normalized;
  } catch (err) {
    // Never crash the API and never invent a fake newer version (§11) — log
    // for debugging, then fall back to the last known-good value.
    console.error('[githubReleaseService] Failed to resolve latest GitHub release:', err.message);
    return cache.version ?? FALLBACK_VERSION;
  }
}
