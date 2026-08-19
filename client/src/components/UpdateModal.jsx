import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowUpCircle,
  CheckCircle2,
  Download,
  Info,
  LoaderCircle,
  RefreshCw,
  Smartphone,
} from 'lucide-react';
import { APK_CONFIG } from '../apkConfig';
import ReleaseNotesMarkdown from './ReleaseNotesMarkdown';
import { getMedianAppVersion, isMedianApp, medianDownloadFile, medianDownloadTrackedFile, medianOpenFile } from '../lib/platform';
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
  const [latestVersion, setLatestVersion] = useState(APK_CONFIG.version);
  const [currentVersion, setCurrentVersion] = useState(null);
  // GitHub Release's own name/body — this is what makes "What's New" appear
  // automatically for every future release with zero code changes (§4).
  const [releaseName, setReleaseName] = useState(null);
  const [releaseNotes, setReleaseNotes] = useState(null);
  const [downloadState, setDownloadState] = useState('idle'); // 'idle' | 'downloading' | 'completed' | 'error' | 'unsupported'
  const [errorMessage, setErrorMessage] = useState('');

  // The APK is downloaded exactly once (Download Update). "Install Update"
  // uses the local APK reference / URI rather than re-downloading.
  const downloadedApkRef = useRef(null);
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
    downloadedApkRef.current = null;

    setDownloadState('downloading');
    setErrorMessage('');

    // Native Median downloads use GitHub's public, absolute asset URL. The
    // browser /download flow continues using the same-origin proxy.
    const directApkUrl = APK_CONFIG.githubDownloadUrl;

    try {
      if (isMedianApp()) {
        // ─────────────────────────────────────────────────────────────────
        // Median Android app shell: use the native bridge to download.
        // Only transition to 'completed' when the callback provides a real
        // local file reference (content URI / file path). Never use the
        // download URL itself as a substitute for a local file reference.
        // ─────────────────────────────────────────────────────────────────
        const started = await medianDownloadTrackedFile({
          url: directApkUrl,
          filename: 'AutoFa.apk',
          onEvent: (res) => {
            if (res?.event === 'progress') return;
            // Cancel watchdog — callback fired.
            if (downloadWatchdogRef.current) {
              clearTimeout(downloadWatchdogRef.current);
              downloadWatchdogRef.current = null;
            }
            downloadInFlightRef.current = false;

            if (!isMountedRef.current) return;

            // Accept only genuine local references (content URI, file path).
            // res.url would be the original download URL — not a local ref.
            const localRef = res?.uri || res?.path || res?.filePath || res?.localUri || res?.localPath;
            if (localRef) {
              downloadedApkRef.current = localRef;
              setDownloadState('completed');
            } else {
              // Median responded but without a usable local file reference.
              downloadedApkRef.current = null;
              setDownloadState('error');
              setErrorMessage(res?.errorMessage || 'Download could not be completed. Please try again.');
            }
          },
        });

        if (!started) {
          // Standard Median download API opens the Android installer itself.
          // It has no completion callback/local-file handle, so never invent
          // one or start a timeout that can falsely report a failed download.
          const dispatched = medianDownloadFile({ url: directApkUrl, filename: 'AutoFa.apk', open: true });
          if (!dispatched) throw new Error('median-bridge-unavailable');
          downloadInFlightRef.current = false;
          setDownloadState('native_install');
        }
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
      downloadedApkRef.current = null;
      setDownloadState('error');
      setErrorMessage('Unable to start the download. Please try again.');
    }
  };

  const handleInstall = () => {
    if (!isMedianApp()) {
      // Never attempt to force-install outside the Median Android app
      setDownloadState('unsupported');
      setErrorMessage('APK installation is only available inside the AutoFA Android app.');
      return;
    }

    // Use the already-downloaded local APK reference — never download it again.
    const localApkRef = downloadedApkRef.current;
    if (!localApkRef) {
      setDownloadState('error');
      setErrorMessage('Local APK reference not found. Please download the update again.');
      return;
    }

    // Open the local file via Median's openFile / FileProvider mechanism
    const opened = medianOpenFile({
      uri: localApkRef,
      url: localApkRef,
      filename: 'AutoFa.apk',
    });

    if (!opened) {
      // §7D: the install dispatch itself failed (bridge unavailable/threw) —
      // the local APK reference is still valid, so keep it and let the user
      // retry installing directly rather than forcing a redundant re-download.
      downloadedApkRef.current = localApkRef;
      setDownloadState('install_error');
      setErrorMessage('Unable to open the APK installer. Please try installing again.');
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

        {/* Informational notice when installation isn't supported in this environment (§6) */}
        {downloadState === 'unsupported' && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-primary/30 bg-primary-soft p-3 text-xs text-primary dark:border-primary/40 dark:bg-primary/10 dark:text-sky-300">
            <Info size={16} className="shrink-0 mt-0.5" />
            <span>{errorMessage || 'APK installation is only available inside the AutoFA Android app.'}</span>
          </div>
        )}

        {/* Success notification when download is complete */}
        {downloadState === 'completed' && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-success/30 bg-success/5 p-3 text-xs font-medium text-success dark:border-success/40 dark:bg-success/10 dark:text-green-400">
            <CheckCircle2 size={16} className="shrink-0" />
            <span>Download complete. Ready to install.</span>
          </div>
        )}
        {downloadState === 'native_install' && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-success/30 bg-success/5 p-3 text-xs font-medium text-success dark:border-success/40 dark:bg-success/10 dark:text-green-400">
            <CheckCircle2 size={16} className="shrink-0" />
            <span>Download started. Android will show the installer when it is ready.</span>
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

          {(downloadState === 'completed' || downloadState === 'unsupported') && (
            <button
              type="button"
              onClick={handleInstall}
              className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-xl bg-success px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 active:scale-[0.98]"
            >
              <Smartphone size={18} />
              Install Update
            </button>
          )}

          {/* §7D: install dispatch failed but the downloaded APK is still valid —
              retry the install itself, don't force the user through another download. */}
          {downloadState === 'install_error' && (
            <button
              type="button"
              onClick={handleInstall}
              className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-xl bg-success px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 active:scale-[0.98]"
            >
              <RefreshCw size={18} />
              Retry Install
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
