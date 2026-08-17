/**
 * Version controller.
 * Returns the current published APK version and minimum required version.
 */
export async function getVersionController(req, res) {
  res.json({
    version: '1.0.0',
    minRequiredVersion: '1.0.0',
    downloadUrl: '/api/download-apk',
    releaseDate: '2026-08-17',
  });
}
