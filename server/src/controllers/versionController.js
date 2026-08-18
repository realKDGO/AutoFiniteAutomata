/**
 * Version controller.
 * Returns the latest available AutoFA version — resolved dynamically from
 * GitHub Releases (see services/githubReleaseService.js) — and the minimum
 * required version. GitHub is only ever a backend data source here; the
 * client never talks to GitHub directly.
 */
import { getLatestReleaseVersion } from '../services/githubReleaseService.js';

/** Oldest version still allowed to run without a forced update. Static by
 *  design (not derived from GitHub) — raise it manually if a release ever
 *  requires cutting off old clients. */
const MIN_REQUIRED_VERSION = '1.0.0';

export async function getVersionController(req, res) {
  const version = await getLatestReleaseVersion();
  res.json({
    version,
    minRequiredVersion: MIN_REQUIRED_VERSION,
    downloadUrl: '/api/download-apk',
    releaseDate: '2026-08-17',
  });
}

