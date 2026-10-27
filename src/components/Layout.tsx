import { NavLink, Outlet } from 'react-router-dom';
import { useEnsureSnapshots } from '../data/months';

type NavItem = { to: string; label: string; end?: boolean; primary?: boolean };

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/trades', label: 'Trades', end: true },
  { to: '/trades/new', label: '+', primary: true },
  { to: '/months', label: 'Months' },
  { to: '/capital', label: 'Capital' },
  { to: '/meezan', label: 'Meezan' },
];

function navClass({ isActive }: { isActive: boolean }) {
  return `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
    isActive ? 'text-fg bg-card' : 'text-muted hover:text-fg'
  }`;
}

export default function Layout() {
  useEnsureSnapshots();
  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar (desktop nav) */}
      <header className="sticky top-0 z-10 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-4 h-14">
          <span className="font-semibold tracking-tight">Trade Tracker</span>
          <nav className="hidden md:flex items-center gap-1">
            {NAV.map((item) =>
              item.primary ? (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className="ml-1 px-3 py-1.5 rounded-md text-sm font-medium bg-accent text-white"
                >
                  New trade
                </NavLink>
              ) : (
                <NavLink key={item.to} to={item.to} end={item.end} className={navClass}>
                  {item.label}
                </NavLink>
              ),
            )}
            <NavLink to="/settings" className={navClass}>
              Settings
            </NavLink>
          </nav>
          <NavLink to="/settings" className="md:hidden text-muted text-sm">
            Settings
          </NavLink>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-6 pb-24 md:pb-6">
        <Outlet />
      </main>

      {/* Bottom tab bar (mobile) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-10 border-t border-border bg-surface/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-6 h-16">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                item.primary
                  ? 'flex items-center justify-center'
                  : `flex items-center justify-center text-xs font-medium ${
                      isActive ? 'text-fg' : 'text-muted'
                    }`
              }
            >
              {item.primary ? (
                <span className="flex items-center justify-center w-11 h-11 rounded-full bg-accent text-white text-2xl leading-none">
                  +
                </span>
              ) : (
                item.label
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
