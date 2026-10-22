import { useQuery } from '@tanstack/react-query';
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes } from 'react-router';

import { api } from './api';
import { useAuth } from './auth';
import { Audit } from './pages/Audit';
import { Disputes } from './pages/Disputes';
import { EventForm } from './pages/EventForm';
import { EventPage } from './pages/EventPage';
import { Events } from './pages/Events';
import { Login } from './pages/Login';
import { Overview } from './pages/Overview';
import { Report } from './pages/Report';
import { Reports } from './pages/Reports';
import { Users } from './pages/Users';
import { Warnings } from './pages/Warnings';
import { t } from './strings';
import { Button } from './ui';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<Shell />}>
          <Route index element={<Overview />} />
          <Route path="events" element={<Events />} />
          <Route path="events/new" element={<EventForm />} />
          <Route path="events/:id" element={<EventPage />} />
          <Route path="events/:id/edit" element={<EventForm />} />
          <Route path="disputes" element={<Disputes />} />
          <Route path="reports" element={<Reports />} />
          <Route path="warnings" element={<Warnings />} />
          <Route path="users" element={<Users />} />
          <Route path="report" element={<Report />} />
          <Route path="audit" element={<Audit />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

function Shell() {
  const { session, signOut } = useAuth();
  // The overview's counts of what waits for a decision double as the badges on the menu.
  const overview = useQuery({ queryKey: ['overview'], queryFn: api.overview, enabled: !!session });
  if (!session) return <Navigate to="/login" replace />;
  const disputes = overview.data?.open_disputes ?? 0;
  const reports = overview.data?.open_reports ?? 0;
  const appeals = overview.data?.appealed_warnings ?? 0;

  const link = (to: string, label: string, count = 0) => (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
      <span>{label}</span>
      {count > 0 && <span className="nav-count tabular">{count}</span>}
    </NavLink>
  );

  return (
    <div className="shell">
      <nav className="sidebar" aria-label={t.panel}>
        <div className="brand">
          <img src="/logo-mark.svg" alt="" />
          <div>
            <strong>{t.appName}</strong>
            <span>{t.panel}</span>
          </div>
        </div>
        {link('/', t.nav.overview)}
        {link('/events', t.nav.events)}
        {link('/disputes', t.nav.disputes, disputes)}
        {link('/reports', t.nav.reports, reports)}
        {link('/warnings', t.nav.warnings, appeals)}
        {link('/users', t.nav.users)}
        {link('/report', t.nav.report)}
        {link('/audit', t.nav.audit)}
        <div className="sidebar-foot">
          <span className="small">{session.user.full_name}</span>
          <Button variant="secondary" className="btn-small" onClick={signOut}>
            {t.signOut}
          </Button>
        </div>
      </nav>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
