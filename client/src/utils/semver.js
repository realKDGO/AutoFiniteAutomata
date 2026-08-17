/**
 * Semantic Version comparison utility.
 *
 * Compares version strings according to SemVer rules (major.minor.patch).
 * Handles examples:
 *   1.0.10 > 1.0.9
 *   1.1.0  > 1.0.9
 *   2.0.0  > 1.9.9
 *   1.0.1  > 1.0.0
 *   1.0.0 == 1.0.0
 */

/**
 * Parses a version string into an array of numbers [major, minor, patch].
 * Strips leading 'v' and handles missing segments.
 *
 * @param {string} version
 * @returns {number[]} [major, minor, patch]
 */
export function parseSemver(version) {
  if (typeof version !== 'string') return [0, 0, 0];
  const cleaned = version.trim().replace(/^v/i, '');
  // Split on dots and extract integer parts
  const parts = cleaned.split('.').map(part => {
    const num = parseInt(part, 10);
    return isNaN(num) ? 0 : num;
  });

  while (parts.length < 3) {
    parts.push(0);
  }

  return parts.slice(0, 3);
}

/**
 * Compares two semantic version strings.
 *
 * @param {string} v1
 * @param {string} v2
 * @returns {number} 1 if v1 > v2, -1 if v1 < v2, 0 if v1 === v2
 */
export function compareSemver(v1, v2) {
  const [maj1, min1, patch1] = parseSemver(v1);
  const [maj2, min2, patch2] = parseSemver(v2);

  if (maj1 !== maj2) return maj1 > maj2 ? 1 : -1;
  if (min1 !== min2) return min1 > min2 ? 1 : -1;
  if (patch1 !== patch2) return patch1 > patch2 ? 1 : -1;
  return 0;
}

/**
 * Returns true if latestVersion is strictly greater than currentVersion.
 *
 * @param {string} currentVersion
 * @param {string} latestVersion
 * @returns {boolean}
 */
export function isUpdateAvailable(currentVersion, latestVersion) {
  return compareSemver(latestVersion, currentVersion) > 0;
}
