import {
  ArrowLeftRight,
  CalendarDays,
  History,
  LayoutDashboard,
  PieChart,
  Plus,
  Settings,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEnsureSnapshots } from '../data/months';
import { Segmented } from './ui';

type Space = 'crypto' | 'funds';

type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean; primary?: boolean };

const NAV: Record<Space, NavItem[]> = {
  crypto: [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/trades', label: 'Trades', icon: ArrowLeftRight, end: true },
    { to: '/trades/new', label: 'New trade', icon: Plus, primary: true },
    { to: '/months', label: 'Months', icon: CalendarDays },
    { to: '/capital', label: 'Capital', icon: Wallet },
  ],
  funds: [
    { to: '/funds', label: 'Overview', icon: PieChart, end: true },
    { to: '/funds/family', label: 'Family', icon: Users },
    { to: '/funds/new', label: 'Add entry', icon: Plus, primary: true },
    { to: '/funds/projections', label: 'Projections', icon: TrendingUp },
    { to: '/funds/history', label: 'History', icon: History },
  ],
};

const HOME: Record<Space, string> = { crypto: '/', funds: '/funds' };
const SPACE_KEY = 'ctt.space';

function spaceOf(pathname: string): Space {
  return pathname.startsWith('/funds') ? 'funds' : 'crypto';
}

function rememberSpace(space: Space) {
  try {
    localStorage.setItem(SPACE_KEY, space);
  } catch {
    // ignore
  }
}

function rememberedSpace(): Space | null {
  try {
    const v = localStorage.getItem(SPACE_KEY);
    return v === 'crypto' || v === 'funds' ? v : null;
  } catch {
    return null;
  }
}

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-accent-strong to-accent/70 shadow-[0_6px_18px_-6px_rgb(212_175_106/0.7)]">
        <span className="h-3 w-3 rotate-45 rounded-[3px] bg-on-accent/85" />
      </span>
      <span className="font-display text-xl tracking-wide text-gold">Ledger</span>
    </Link>
  );
}

export default function Layout() {
  useEnsureSnapshots();
  const location = useLocation();
  const navigate = useNavigate();
  const space = spaceOf(location.pathname);

  // Remember the space; on a fresh open at "/", go back to the space used last time.
  useEffect(() => {
    if (
      location.pathname === '/' &&
      rememberedSpace() === 'funds' &&
      !sessionStorage.getItem(SPACE_KEY)
    ) {
      navigate('/funds', { replace: true });
    }
    sessionStorage.setItem(SPACE_KEY, '1');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => rememberSpace(space), [space]);

  const switchSpace = (s: Space) => s !== space && navigate(HOME[s]);
  const items = NAV[space];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-surface/75 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl flex items-center gap-4 px-4 h-16">
          <Logo />
          <div className="flex-1 flex justify-center md:justify-start md:pl-4">
            <Segmented
              value={space}
              onChange={switchSpace}
              options={[
                { value: 'crypto', label: 'Crypto' },
                { value: 'funds', label: 'Funds' },
              ]}
            />
          </div>
          <nav className="hidden md:flex items-center gap-1">
            {items.map((item) =>
              item.primary ? (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className="ml-2 inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-b from-accent-strong to-accent px-3.5 py-2 text-sm font-medium text-on-accent shadow-[0_6px_20px_-8px_rgb(212_175_106/0.6)] hover:brightness-110"
                >
                  <item.icon size={16} strokeWidth={2.25} />
                  {item.label}
                </NavLink>
              ) : (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `relative px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? 'text-fg after:absolute after:inset-x-3 after:-bottom-[13px] after:h-0.5 after:rounded-full after:bg-accent'
                        : 'text-muted hover:text-fg'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ),
            )}
          </nav>
          <NavLink
            to="/settings"
            aria-label="Settings"
            className={({ isActive }) =>
              `grid h-9 w-9 place-items-center rounded-xl border transition-colors ${
                isActive ? 'border-accent/50 text-accent' : 'border-border text-muted hover:text-fg'
              }`
            }
          >
            <Settings size={17} />
          </NavLink>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-6 sm:py-8 pb-28 md:pb-10">
        <Outlet />
      </main>

      {/* Bottom tab bar (mobile) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 border-t border-border/70 bg-surface/85 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5 h-[68px]">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              aria-label={item.label}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-1 text-[10px] font-medium tracking-wide transition-colors ${
                  item.primary ? '' : isActive ? 'text-accent' : 'text-muted'
                }`
              }
            >
              {item.primary ? (
                <span className="-mt-5 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-b from-accent-strong to-accent text-on-accent shadow-[0_10px_28px_-8px_rgb(212_175_106/0.8)] ring-4 ring-surface">
                  <item.icon size={26} strokeWidth={2.25} />
                </span>
              ) : (
                <>
                  <item.icon size={21} strokeWidth={1.75} />
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
