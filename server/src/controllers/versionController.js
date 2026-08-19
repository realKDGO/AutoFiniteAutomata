/**
 * Version controller.
 * Returns the latest available AutoFA release info — resolved dynamically
 * from GitHub Releases (see services/githubReleaseService.js) — plus the
 * minimum required version. GitHub is only ever a backend data source
 * here; the client never talks to GitHub directly.
 */
import { getLatestRelease } from '../services/githubReleaseService.js';

/** Oldest version still allowed to run without a forced update. Static by
 *  design (not derived from GitHub) — raise it manually if a release ever
 *  requires cutting off old clients. */
const MIN_REQUIRED_VERSION = '1.0.0';

export async function getVersionController(req, res) {
  const release = await getLatestRelease();
  res.json({
    version: release.version,
    minRequiredVersion: MIN_REQUIRED_VERSION,
    // Same-origin proxy — kept as the primary downloadUrl so existing
    // clients that only read this field keep working unchanged.
    downloadUrl: '/api/download-apk',
    releaseName: release.releaseName,
    releaseDate: release.releaseDate,
    releaseNotes: release.releaseNotes,
  });
}
