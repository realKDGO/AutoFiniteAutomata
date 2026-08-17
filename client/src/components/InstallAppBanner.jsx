import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Smartphone, X } from 'lucide-react';
import {
  ANDROID_APP_INSTALL_URL,
  dismissInstallPrompt,
  isAndroidMobileBrowser,
  shouldShowInstallPrompt,
} from '../lib/platform';

/**
 * Android app install/get recommendation banner.
 *
 * Appears on Android mobile browsers and desktop browsers when not dismissed,
 * and never inside the Median APK or on iOS.
 *
 * Hidden completely on the /download page.
 */
export default function InstallAppBanner() {
  const [visible, setVisible] = useState(false);
  const [entered, setEntered] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const isDownloadPage = location.pathname === '/download';
  const isMobile = isAndroidMobileBrowser();

  useEffect(() => {
    // Evaluate once on mount. Detection is synchronous and cheap.
    setVisible(shouldShowInstallPrompt());
  }, []);

  useEffect(() => {
    if (!visible) return;
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [visible]);

  // Never render on the /download page or when not eligible/dismissed
  if (!visible || isDownloadPage) return null;

  const handleDismiss = () => {
    dismissInstallPrompt();
    setEntered(false);
    // Let the slide-down finish before unmounting.
    window.setTimeout(() => setVisible(false), 200);
  };

  const canInstall = Boolean(ANDROID_APP_INSTALL_URL);

  const handleInstall = () => {
    if (!canInstall) return;
    // Use React Router for internal paths (e.g. /download) so the app
    // navigates without a full page reload. Fall back to window.location.href
    // for future external URLs (e.g. a Play Store listing).
    const isExternal = /^https?:\/\//i.test(ANDROID_APP_INSTALL_URL);
    if (isExternal) {
      window.location.href = ANDROID_APP_INSTALL_URL;
    } else {
      navigate(ANDROID_APP_INSTALL_URL);
    }
  };

  return (
    <div
      role="dialog"
      aria-label="AutoFA for Android"
      className={`fixed inset-x-3 bottom-3 sm:inset-x-auto sm:right-6 sm:bottom-6 z-[80] mx-auto sm:mx-0 max-w-md sm:max-w-sm rounded-2xl border border-line bg-surface p-4 shadow-lift transition-all duration-300 ease-out dark:border-line-dark dark:bg-surface-dark ${
        entered ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      }`}
      style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))' }}
    >
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary dark:bg-primary/15 dark:text-sky-300">
          <Smartphone size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink dark:text-ink-dark">
            {isMobile ? 'Get AutoFA for Android' : 'AutoFA for Android'}
          </p>
          <p className="mt-0.5 text-xs text-ink-muted dark:text-ink-darkMuted">
            {isMobile
              ? "You're using AutoFA in a mobile browser. Install the Android app for a smoother, full-screen experience."
              : 'AutoFA is also available for Android.'}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={handleInstall}
              disabled={!canInstall}
              title={canInstall ? undefined : 'Install link is not configured yet.'}
              className="focus-ring inline-flex items-center justify-center rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-primary-hover active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
            >
              {isMobile ? 'Install AutoFA' : 'Get AutoFA'}
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="focus-ring inline-flex items-center justify-center rounded-xl px-3.5 py-2 text-xs font-semibold text-ink-muted transition hover:bg-primary-soft hover:text-primary dark:text-ink-darkMuted dark:hover:bg-primary/15"
            >
              Maybe Later
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="focus-ring -mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-ink-soft hover:bg-primary-soft hover:text-primary dark:hover:bg-primary/15"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
