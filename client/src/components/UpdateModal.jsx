import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowUpCircle,
  CheckCircle2,
  Download,
  LoaderCircle,
  RefreshCw,
} from 'lucide-react';
import { APK_CONFIG } from '../apkConfig';
import ReleaseNotesMarkdown from './ReleaseNotesMarkdown';
import { getMedianAppVersion, isMedianApp, medianShareDownloadFile, openSystemDownloads } from '../lib/platform';
import { isUpdateAvailable } from '../utils/semver';

const NATIVE_DOWNLOAD_SAFETY_TIMEOUT_MS = 5 * 60 * 1000;

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
  const [latestVersion, setLatestVersion] = useState(APK_CONFIG.version);
  const [currentVersion, setCurrentVersion] = useState(null);
  // GitHub Release's own name/body — this is what makes "What's New" appear
  // automatically for every future release with zero code changes (§4).
  const [releaseName, setReleaseName] = useState(null);
  const [releaseNotes, setReleaseNotes] = useState(null);
  const [downloadState, setDownloadState] = useState('idle'); // 'idle' | 'downloading' | 'downloaded' | 'error'
  const [errorMessage, setErrorMessage] = useState('');
  const [downloadStatus, setDownloadStatus] = useState('');

  const downloadInFlightRef = useRef(false);
  const downloadWatchdogRef = useRef(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Cancel any pending download watchdog on unmount
      if (downloadWatchdogRef.current) {
        clearTimeout(downloadWatchdogRef.current);
        downloadWatchdogRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    // APK updates apply only to the installed Median shell, never a browser.
    if (!isMedianApp()) return;

    let isMounted = true;

    async function checkVersion() {
      try {
        const installedVersion = await getMedianAppVersion();
        const authoritativeVersion = installedVersion || APK_CONFIG.version;
        const res = await fetch('/api/version');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const serverVersion = data.version || APK_CONFIG.version;

        if (isMounted) {
          setLatestVersion(serverVersion);
          setCurrentVersion(authoritativeVersion);
          if (typeof data.releaseName === 'string') setReleaseName(data.releaseName);
          if (typeof data.releaseNotes === 'string') setReleaseNotes(data.releaseNotes);
          if (isUpdateAvailable(authoritativeVersion, serverVersion)) {
            setUpdateAvailable(true);
          }
        }
      } catch {
        // If offline or endpoint is unreachable, gracefully fall back to local config
        const installedVersion = await getMedianAppVersion();
        const authoritativeVersion = installedVersion || APK_CONFIG.version;
        if (isMounted) setCurrentVersion(authoritativeVersion);
        if (isMounted && isUpdateAvailable(authoritativeVersion, APK_CONFIG.version)) {
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

  const handleDownload = async () => {
    // Never allow multiple simultaneous downloads (e.g. double-tap).
    if (downloadInFlightRef.current) return;
    downloadInFlightRef.current = true;
    setDownloadState('downloading');
    setErrorMessage('');
    setDownloadStatus('Preparing download...');

    // Native Median downloads use GitHub's public, absolute asset URL. The
    // browser /download flow continues using the same-origin proxy.
    const directApkUrl = APK_CONFIG.githubDownloadUrl;

    try {
      if (isMedianApp()) {
        console.info('[AutoFA update] native bridge detected', true);
        // The APK's injected bridge exposes this command as a Promise. Its
        // resolved value is the authoritative completion signal; no plugin
        // callback or elapsed-time guess is used to declare success.
        setDownloadStatus('Starting download...');
        downloadWatchdogRef.current = window.setTimeout(() => {
          if (!downloadInFlightRef.current || !isMountedRef.current) return;
          downloadInFlightRef.current = false;
          setDownloadState('error');
          setDownloadStatus('');
          setErrorMessage('The native download did not finish. Please try again.');
        }, NATIVE_DOWNLOAD_SAFETY_TIMEOUT_MS);
        const result = await medianShareDownloadFile({ url: directApkUrl, filename: 'AutoFa.apk', open: false });
        if (downloadWatchdogRef.current) clearTimeout(downloadWatchdogRef.current);
        downloadWatchdogRef.current = null;
        // A late native callback must not overwrite the safety-timeout error.
        if (!isMountedRef.current || !downloadInFlightRef.current) return;
        downloadInFlightRef.current = false;
        // System Downloads owns the saved APK. A local URI is not required
        // for this manual install flow.
        console.info('[AutoFA update] native system download completed', result);
        setDownloadStatus('AutoFa.apk has been saved to your Downloads folder.');
        setDownloadState('downloaded');
        console.info('[AutoFA update] download state changed', 'downloaded');
      } else {
        // ─────────────────────────────────────────────────────────────────
        // Plain browser (desktop or non-Median Android):
        // Trigger a standard browser download of the APK file.
        // Install Update is not available outside the Median app shell.
        // ─────────────────────────────────────────────────────────────────
        const link = document.createElement('a');
        link.href = APK_CONFIG.downloadUrl;
        link.download = 'AutoFa.apk';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        downloadInFlightRef.current = false;
        setDownloadState('unsupported');
        setErrorMessage('APK installation via Install Update is only available inside the AutoFA Android app.');
      }
    } catch {
      if (downloadWatchdogRef.current) {
        clearTimeout(downloadWatchdogRef.current);
        downloadWatchdogRef.current = null;
      }
      downloadInFlightRef.current = false;
      setDownloadState('error');
      setDownloadStatus('');
      setErrorMessage('Unable to start the download. Please try again.');
    }
  };

  const handleOpenDownloads = () => {
    const opened = openSystemDownloads();
    if (!opened) {
      setDownloadStatus('Update downloaded successfully. Open your phone\'s Files or Downloads app and tap AutoFa.apk to install it.');
    }
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
                v{currentVersion || APK_CONFIG.version}
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

        {/* What's New — sourced directly from the GitHub Release body, so a
            new release's patch notes show up automatically (§4). */}
        {releaseNotes && (
          <div className="mt-4 rounded-xl border border-line bg-surface-muted p-3.5 dark:border-line-dark dark:bg-surface-darkMuted">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-ink-muted dark:text-ink-darkMuted">
              What&rsquo;s New{releaseName ? ` · ${releaseName}` : ''}
            </h3>
            <div className="mt-2"><ReleaseNotesMarkdown markdown={releaseNotes} /></div>
          </div>
        )}

        {/* Error notification if download or install fails */}
        {(downloadState === 'error' || downloadState === 'install_error') && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger/5 p-3 text-xs text-danger dark:border-danger/40 dark:bg-danger/10">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{errorMessage || 'Unable to download the update. Please try again.'}</span>
          </div>
        )}

        {downloadState === 'downloaded' && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-success/30 bg-success/5 p-3 text-xs font-medium text-success dark:border-success/40 dark:bg-success/10 dark:text-green-400">
            <CheckCircle2 size={16} className="shrink-0" />
            <span>{downloadStatus} Tap Open Downloads, then tap AutoFa.apk to install the update.</span>
          </div>
        )}
        {downloadState === 'downloading' && (() => {
          return (
            <div className="mt-4 rounded-xl border border-primary/25 bg-primary-soft/50 p-3.5 dark:border-primary/35 dark:bg-primary/10">
              <div className="flex items-center gap-2 text-xs font-semibold text-ink dark:text-ink-dark">
                <LoaderCircle size={15} className="animate-spin text-primary dark:text-sky-300" />
                <span>{downloadStatus || 'Downloading AutoFA update...'}</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-primary/15 dark:bg-white/10">
                <div className="h-full w-2/5 animate-pulse rounded-full bg-primary dark:bg-sky-300" />
              </div>
            </div>
          );
        })()}

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
            <button type="button" disabled className="focus-ring inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-primary-hover px-4 py-3 text-sm font-semibold text-white opacity-80">
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
              Retry Update
            </button>
          )}

          {downloadState === 'downloaded' && (
            <button
              type="button"
              onClick={handleOpenDownloads}
              className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-xl bg-success px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 active:scale-[0.98]"
            >
              <Download size={18} />
              Open Downloads
            </button>
          )}

        </div>
      </div>
    </div>
  );
}
