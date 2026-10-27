import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import RequireAuth from './auth/RequireAuth';
import Layout from './components/Layout';
import Login from './pages/Login';

// Pages are split into their own chunks; charts (Recharts) only load where they are used.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Trades = lazy(() => import('./pages/Trades'));
const NewTrade = lazy(() => import('./pages/NewTrade'));
const Position = lazy(() => import('./pages/Position'));
const Months = lazy(() => import('./pages/Months'));
const Month = lazy(() => import('./pages/Month'));
const Capital = lazy(() => import('./pages/Capital'));
const Settings = lazy(() => import('./pages/Settings'));
const Meezan = lazy(() => import('./pages/Meezan'));

function PageFallback() {
  return (
    <div className="space-y-3">
      <div className="h-7 w-40 animate-pulse rounded bg-card" />
      <div className="h-32 animate-pulse rounded-xl bg-card" />
    </div>
  );
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        {(
          [
            ['', Dashboard],
            ['trades', Trades],
            ['trades/new', NewTrade],
            ['trades/:id', Position],
            ['months', Months],
            ['months/:month', Month],
            ['capital', Capital],
            ['meezan', Meezan],
            ['settings', Settings],
          ] as const
        ).map(([path, Page]) => (
          <Route
            key={path || 'index'}
            {...(path ? { path } : { index: true })}
            element={
              <Suspense fallback={<PageFallback />}>
                <Page />
              </Suspense>
            }
          />
        ))}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
