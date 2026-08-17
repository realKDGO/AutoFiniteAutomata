import { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowUpCircle,
  CheckCircle2,
  Download,
  LoaderCircle,
  RefreshCw,
  Smartphone,
} from 'lucide-react';
import { APK_CONFIG, CURRENT_APP_VERSION, LATEST_APP_VERSION } from '../apkConfig';
import { isAndroid, isIOS, isMedianApp } from '../lib/platform';
import { isUpdateAvailable } from '../utils/semver';

/**
 * UpdateModal component.
 *
 * Mandatory update modal shown when AutoFA detects a newer APK version
 * is available.
 *
 * Applicable when running on Android / inside the Median APK.
 * Does not force APK updates on desktop browsers or iOS devices.
 */
export default function UpdateModal() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [latestVersion, setLatestVersion] = useState(LATEST_APP_VERSION);
  const [downloadState, setDownloadState] = useState('idle'); // 'idle' | 'downloading' | 'completed' | 'error'
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    // Determine whether APK update checking applies to this client environment.
    // Desktop and iOS browsers run the web client and should not be prompted to install APKs.
    const isAppEnvironment = isMedianApp() || (isAndroid() && !isIOS());
    if (!isAppEnvironment) return;

    let isMounted = true;

    async function checkVersion() {
      try {
        const res = await fetch('/api/version');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const serverVersion = data.version || LATEST_APP_VERSION;

        if (isMounted) {
          setLatestVersion(serverVersion);
          if (isUpdateAvailable(CURRENT_APP_VERSION, serverVersion)) {
            setUpdateAvailable(true);
          }
        }
      } catch {
        // If offline or endpoint is unreachable, gracefully fall back to local config
        if (isMounted && isUpdateAvailable(CURRENT_APP_VERSION, LATEST_APP_VERSION)) {
          setUpdateAvailable(true);
        }
      }
    }

    checkVersion();

    return () => {
      isMounted = false;
    };
  }, []);

  if (!updateAvailable) return null;

  const handleDownload = () => {
    setDownloadState('downloading');
    setErrorMessage('');

    try {
      // Trigger download using the same-origin endpoint
      const link = document.createElement('a');
      link.href = APK_CONFIG.downloadUrl;
      link.download = 'AutoFa.apk';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Transition to completed state after browser initiates download
      setTimeout(() => {
        setDownloadState('completed');
      }, 2500);
    } catch {
      setDownloadState('error');
      setErrorMessage('Unable to download the update. Please try again.');
    }
  };

  const handleInstall = () => {
    // Launch/open the downloaded APK or re-trigger download to open Android installer
    window.location.href = APK_CONFIG.downloadUrl;
  };

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-modal-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl dark:border-line-dark dark:bg-surface-dark">
        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary dark:bg-primary/15 dark:text-sky-300">
            <ArrowUpCircle size={26} />
          </div>
          <div>
            <p className="eyebrow mb-1">AUTOFA UPDATE</p>
            <h2 id="update-modal-title" className="font-display text-xl font-bold text-ink dark:text-ink-dark">
              Update Available
            </h2>
          </div>
        </div>

        {/* Body message */}
        <p className="mt-4 text-sm leading-6 text-ink-muted dark:text-ink-darkMuted">
          A new version of AutoFA is available. You need to update AutoFA to continue using the latest features.
        </p>

        {/* Version comparison box */}
        <div className="mt-4 rounded-xl border border-line bg-surface-muted p-3.5 dark:border-line-dark dark:bg-surface-darkMuted">
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="rounded-lg border border-line/60 bg-surface px-3 py-2 dark:border-line-dark dark:bg-surface-dark">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                Current version
              </span>
              <p className="mt-0.5 font-mono text-sm font-bold text-ink dark:text-ink-dark">
                v{CURRENT_APP_VERSION}
              </p>
            </div>
            <div className="rounded-lg border border-success/30 bg-success/5 px-3 py-2 dark:border-success/40 dark:bg-success/10">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-success dark:text-green-400">
                Latest version
              </span>
              <p className="mt-0.5 font-mono text-sm font-bold text-success dark:text-green-400">
                v{latestVersion}
              </p>
            </div>
          </div>
        </div>

        {/* Error notification if download fails */}
        {downloadState === 'error' && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger/5 p-3 text-xs text-danger dark:border-danger/40 dark:bg-danger/10">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{errorMessage || 'Unable to download the update. Please try again.'}</span>
          </div>
        )}

        {/* Success notification when download is complete */}
        {downloadState === 'completed' && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-success/30 bg-success/5 p-3 text-xs font-medium text-success dark:border-success/40 dark:bg-success/10 dark:text-green-400">
            <CheckCircle2 size={16} className="shrink-0" />
            <span>Download complete. Ready to install.</span>
          </div>
        )}

        {/* Action Button */}
        <div className="mt-6">
          {downloadState === 'idle' && (
            <button
              type="button"
              onClick={handleDownload}
              className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-hover active:scale-[0.98]"
            >
              <Download size={18} />
              Download Update
            </button>
          )}

          {downloadState === 'downloading' && (
            <button
              type="button"
              disabled
              className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary-hover px-4 py-3 text-sm font-semibold text-white opacity-85 cursor-not-allowed"
            >
              <LoaderCircle size={18} className="animate-spin" />
              Downloading update...
            </button>
          )}

          {downloadState === 'error' && (
            <button
              type="button"
              onClick={handleDownload}
              className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary-hover active:scale-[0.98]"
            >
              <RefreshCw size={18} />
              Retry Download
            </button>
          )}

          {downloadState === 'completed' && (
            <button
              type="button"
              onClick={handleInstall}
              className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-xl bg-success px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 active:scale-[0.98]"
            >
              <Smartphone size={18} />
              Install Update
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
