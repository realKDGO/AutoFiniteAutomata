import { useEffect, useState } from 'react';
import { Menu, Moon, Sun, X } from 'lucide-react';
import logo from '../assets/logo.png';
import InstallAppBanner from '../components/InstallAppBanner';
import UpdateModal from '../components/UpdateModal';
import { isMedianApp } from '../lib/platform';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
const links = [['/', 'Home'], ['/builder', 'Builder'], ['/generate', 'Generator'], ['/result', 'Results'], ['/about', 'About']];
function Brand() { return <NavLink to="/" className="focus-ring mb-9 flex items-center gap-2 font-display text-xl font-bold text-ink dark:text-ink-dark"><img src={logo} alt="AutoFA" className="size-9 rounded-xl object-cover shadow-sm" />AutoFA</NavLink>; }
function ThemeButton({ dark, setDark, compact = false }) { return <button className={`focus-ring flex ${compact ? '' : 'w-full'} items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-ink-muted transition hover:bg-primary-soft hover:text-primary dark:text-ink-darkMuted dark:hover:bg-primary/15`} onClick={() => setDark(value => !value)} aria-label="Toggle colour theme">{dark ? <Sun size={18} /> : <Moon size={18} />}{!compact && (dark ? 'Light mode' : 'Dark mode')}</button>; }
export default function AppLayout() {
  const [dark, setDark] = useState(() => localStorage.theme === 'dark');
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const insideMedian = isMedianApp();
  useEffect(() => { document.documentElement.classList.toggle('dark', dark); localStorage.theme = dark ? 'dark' : 'light'; }, [dark]);
  // Close the mobile sidebar automatically on route change (kept mounted for
  // its own close animation, see the always-rendered panel below).
  useEffect(() => { setOpen(false); }, [pathname]);
  const navigation = <nav className="space-y-1" aria-label="Primary navigation">{links.map(([to, label]) => <NavLink key={to} to={to} onClick={() => setOpen(false)} className={({ isActive }) => `focus-ring block rounded-xl border-l-2 px-3 py-2.5 text-sm font-semibold transition ${isActive ? 'border-primary bg-primary-soft text-primary dark:bg-primary/15 dark:text-sky-300' : 'border-transparent text-ink-muted hover:bg-primary-soft/70 hover:text-ink dark:text-ink-darkMuted dark:hover:bg-primary/10 dark:hover:text-ink-dark'}`}>{label}</NavLink>)}</nav>;
  return (
    <div className="app-shell-min-h bg-canvas dark:bg-canvas-dark">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-line bg-surface/95 p-5 backdrop-blur dark:border-line-dark dark:bg-surface-dark/95 lg:block">
        <Brand />{navigation}
        <div className="absolute inset-x-5 bottom-5"><ThemeButton dark={dark} setDark={setDark} /></div>
      </aside>

      {/* Mobile sidebar — always mounted (never conditionally unmounted) so
          both the open AND close gestures get a smooth transform transition
          instead of the panel instantly popping in/out. When closed it's
          fully translated off-screen and pointer-events-none so it never
          intercepts taps on the page underneath. */}
      <div className={`fixed inset-0 z-50 lg:hidden ${open ? '' : 'pointer-events-none'}`}>
        <button
          aria-label="Close navigation"
          tabIndex={open ? 0 : -1}
          className={`absolute inset-0 bg-ink/35 backdrop-blur-[1px] transition-opacity duration-300 ease-out ${open ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setOpen(false)}
        />
        <aside
          aria-hidden={!open}
          className={`relative h-full w-72 bg-surface p-5 shadow-2xl transition-transform duration-300 ease-out will-change-transform dark:bg-surface-dark ${open ? 'translate-x-0' : '-translate-x-full'}`}
        >
          <button className="focus-ring absolute right-4 top-4 rounded-lg p-2" onClick={() => setOpen(false)} aria-label="Close navigation" tabIndex={open ? 0 : -1}><X size={20} /></button>
          <Brand />{navigation}
        </aside>
      </div>

      <div className="app-shell-min-h flex flex-col lg:pl-60">
        <header className="sticky top-0 z-20 border-b border-line bg-surface/80 px-5 py-3 backdrop-blur-xl dark:border-line-dark dark:bg-canvas-dark/80 lg:px-10">
          <div className="mx-auto flex max-w-7xl items-center">
            <button className="focus-ring rounded-lg p-2 lg:hidden" aria-label="Open navigation" onClick={() => setOpen(true)}><Menu size={21} /></button>
            <p className="hidden text-sm font-medium text-ink-muted sm:block dark:text-ink-darkMuted">Learn formal languages visually.</p>
            <div className="ml-auto lg:hidden"><ThemeButton dark={dark} setDark={setDark} compact /></div>
          </div>
        </header>

        {/* flex-1 pushes the footer to the bottom of the viewport on short
            pages, while letting it flow naturally after long content. The
            mobile-page-transition wrapper (key={pathname}) gives route
            changes a short, native-feeling fade+rise on mobile only — it's a
            no-op on desktop and never touches Builder's own internal state
            since it only remounts when the ROUTE itself changes. */}
        <main className="flex-1">
          <div key={pathname} className="mobile-page-transition">
            <Outlet />
          </div>
        </main>

        <footer className="border-t border-line px-5 py-7 text-center text-sm text-ink-muted dark:border-line-dark dark:text-ink-darkMuted">
          <span>© 2026 AutoFA · A learning tool for formal languages.</span>
          {!insideMedian && (
            <>
              <span className="mx-2" aria-hidden="true">·</span>
              <Link
                to="/download"
                className="focus-ring rounded font-medium text-primary hover:underline dark:text-sky-300"
              >
                Android App
              </Link>
            </>
          )}
        </footer>
      </div>
      <InstallAppBanner />
      <UpdateModal />
    </div>
  );
}