import { Readable } from 'stream';

const GITHUB_LATEST_APK_URL =
  'https://github.com/realKDGO/AutoFiniteAutomata/releases/latest/download/AutoFa.apk';

/**
 * Same-origin APK proxy endpoint.
 *
 * Fetches the latest AutoFa.apk from GitHub Releases (following the /latest/download/ redirect)
 * and streams it directly to the client as an attachment.
 * This keeps GitHub behind the scenes and ensures the user never leaves AutoFA.
 */
export async function downloadApkController(req, res, next) {
  try {
    const response = await fetch(GITHUB_LATEST_APK_URL, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'AutoFA-Server/1.0',
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Unable to download the latest AutoFA APK right now. Please try again later.',
        status: response.status,
      });
    }

    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', 'attachment; filename="AutoFa.apk"');

    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    if (response.body) {
      if (typeof Readable.fromWeb === 'function') {
        Readable.fromWeb(response.body).pipe(res);
      } else {
        const arrayBuffer = await response.arrayBuffer();
        res.send(Buffer.from(arrayBuffer));
      }
    } else {
      res.status(500).json({ error: 'Empty response body from APK source' });
    }
  } catch (err) {
    next(err);
  }
}
