import { Navigate, Route, Routes } from 'react-router-dom';
import RequireAuth from './auth/RequireAuth';
import Layout from './components/Layout';
import Capital from './pages/Capital';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Month from './pages/Month';
import Months from './pages/Months';
import NewTrade from './pages/NewTrade';
import Position from './pages/Position';
import Settings from './pages/Settings';
import Trades from './pages/Trades';

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
        <Route index element={<Dashboard />} />
        <Route path="trades" element={<Trades />} />
        <Route path="trades/new" element={<NewTrade />} />
        <Route path="trades/:id" element={<Position />} />
        <Route path="months" element={<Months />} />
        <Route path="months/:month" element={<Month />} />
        <Route path="capital" element={<Capital />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
