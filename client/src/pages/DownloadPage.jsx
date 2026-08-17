import { useState } from 'react';
import { AlertCircle, ArrowLeft, CheckCircle, Download, RefreshCw, Smartphone } from 'lucide-react';
import { Link } from 'react-router-dom';
import logo from '../assets/logo.png';
import { APK_CONFIG } from '../apkConfig';

/**
 * /download — AutoFA Android APK download page.
 *
 * This is the permanent user-facing destination for downloading the AutoFA
 * Android app. GitHub is the APK release source but is kept behind the scenes;
 * users only interact with this page.
 *
 * The APK download URL uses GitHub Releases' /latest/download/ redirect so
 * future releases automatically surface here without a code change — as long
 * as the asset is always named "AutoFa.apk".
 */

export default function DownloadPage() {
  const [downloadState, setDownloadState] = useState('idle'); // 'idle' | 'downloading' | 'error'

  const handleDownload = () => {
    setDownloadState('downloading');
    // The browser handles the actual file download via the <a> element.
    // We give it a moment, then assume success (the browser takes over).
    // If the network request fails at the OS level the user will see a
    // native browser error; we can only catch JS-layer failures here.
    setTimeout(() => setDownloadState('idle'), 3000);
  };

  const handleRetry = () => {
    setDownloadState('idle');
  };

  return (
    <div className="flex flex-col pb-12">
      {/* Back navigation */}
      <div className="px-5 pt-6 sm:px-8">
        <Link
          to="/"
          className="focus-ring inline-flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-sm font-medium text-ink-muted transition hover:bg-primary-soft hover:text-primary dark:text-ink-darkMuted dark:hover:bg-primary/15"
        >
          <ArrowLeft size={16} />
          Back to AutoFA
        </Link>
      </div>

      {/* Centred card */}
      <div className="mobile-page-transition mx-auto w-full max-w-md flex-1 px-5 py-6 sm:px-8">
        {/* App identity */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex size-20 items-center justify-center rounded-2xl bg-primary-soft shadow-card dark:bg-primary/15">
            <img src={logo} alt="AutoFA" className="size-14 rounded-xl object-cover" />
          </div>
          <p className="eyebrow mb-2">ANDROID APP</p>
          <h1 className="font-display text-3xl font-bold tracking-tight text-ink dark:text-ink-dark">
            AutoFA for Android
          </h1>
          <p className="mt-3 leading-6 text-ink-muted dark:text-ink-darkMuted">
            Get the AutoFA Android app for a better mobile experience.
          </p>
        </div>

        {/* Main download card */}
        <section className="section-card overflow-hidden">
          {/* Version + meta row */}
          <div className="border-b border-line px-6 py-4 dark:border-line-dark">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-lg bg-success/10 px-2.5 py-1 text-xs font-bold text-success dark:text-green-400">
                  v{APK_CONFIG.version}
                </span>
                <span className="text-xs text-ink-muted dark:text-ink-darkMuted">
                  Latest release
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-ink-muted dark:text-ink-darkMuted">
                {APK_CONFIG.apkSize && (
                  <span>{APK_CONFIG.apkSize}</span>
                )}
                {APK_CONFIG.lastUpdated && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{APK_CONFIG.lastUpdated}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Download button area */}
          <div className="px-6 py-6">
            {downloadState === 'error' ? (
              <div className="rounded-xl border border-danger/30 bg-danger/5 p-4 dark:border-danger/40 dark:bg-danger/10">
                <div className="flex items-start gap-3">
                  <AlertCircle size={20} className="mt-0.5 shrink-0 text-danger" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-danger">Download unavailable</p>
                    <p className="mt-1 text-xs leading-5 text-ink-muted dark:text-ink-darkMuted">
                      Unable to download the latest AutoFA APK right now. Please check your
                      connection and try again.
                    </p>
                    <button
                      type="button"
                      onClick={handleRetry}
                      className="focus-ring mt-3 inline-flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-1.5 text-xs font-semibold text-danger transition hover:bg-danger/5"
                    >
                      <RefreshCw size={13} />
                      Try again
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <a
                href={APK_CONFIG.downloadUrl}
                download="AutoFa.apk"
                onClick={handleDownload}
                className={`focus-ring flex w-full items-center justify-center gap-2.5 rounded-xl px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition duration-200 active:scale-[0.98] ${
                  downloadState === 'downloading'
                    ? 'bg-primary-hover'
                    : 'bg-primary hover:bg-primary-hover hover:shadow-[0_6px_16px_rgb(22_131_216_/_0.22)]'
                }`}
                aria-label={`Download AutoFA APK version ${APK_CONFIG.version}`}
              >
                {downloadState === 'downloading' ? (
                  <>
                    <CheckCircle size={18} />
                    Starting download…
                  </>
                ) : (
                  <>
                    <Download size={18} />
                    Download AutoFA
                  </>
                )}
              </a>
            )}

            <p className="mt-3 text-center text-xs text-ink-muted dark:text-ink-darkMuted">
              AutoFa.apk · Requires Android 6.0+
            </p>
          </div>

          {/* What's New */}
          {APK_CONFIG.whatsNew && APK_CONFIG.whatsNew.length > 0 && (
            <div className="border-t border-line px-6 py-5 dark:border-line-dark">
              <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.15em] text-ink-muted dark:text-ink-darkMuted">
                What&rsquo;s New
              </h2>
              <ul className="space-y-2">
                {APK_CONFIG.whatsNew.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-ink dark:text-ink-dark">
                    <CheckCircle
                      size={14}
                      className="mt-0.5 shrink-0 text-success dark:text-green-400"
                      aria-hidden="true"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Installation note */}
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark">
          <Smartphone size={18} className="mt-0.5 shrink-0 text-primary dark:text-sky-300" />
          <div>
            <p className="text-sm font-semibold text-ink dark:text-ink-dark">
              Installing the APK
            </p>
            <p className="mt-1 text-xs leading-5 text-ink-muted dark:text-ink-darkMuted">
              After downloading, open the file and allow installation from unknown sources in your
              Android settings if prompted.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
