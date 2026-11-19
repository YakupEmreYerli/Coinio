import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api, type AuthState } from './api';
import { resolveLocale, setLocale, t, useLocale } from './i18n';
import { AppShell } from './layout/AppShell';
import { AppearanceRoot } from './lib/AppearanceRoot';
import { useSettings } from './lib/hooks';
import { Calendar } from './routes/Calendar';
import { Dashboard } from './routes/Dashboard';
import { Login } from './routes/Login';
import { Payments } from './routes/Payments';
import { Reports } from './routes/Reports';
import { Setup } from './routes/Setup';
import { Subscriptions } from './routes/Subscriptions';
import { SettingsLayout } from './routes/settings/SettingsLayout';
import { Welcome, useOnboarding } from './routes/Welcome';

/** Signed-in part: keeps language and appearance in sync with the server. */
function SignedIn({ user }: { user: { id: number; username: string } }) {
  const settings = useSettings().data;
  useEffect(() => {
    if (settings) setLocale(resolveLocale(settings.locale, navigator.languages));
  }, [settings]);
  const onboarding = useOnboarding().data;
  const location = useLocation();
  const navigate = useNavigate();
  if (onboarding && !onboarding.completed && location.pathname !== '/welcome' && !location.pathname.startsWith('/settings/import')) {
    return <Navigate to="/welcome" replace />;
  }
  return (
    <AppearanceRoot>
      <Routes>
        <Route path="/welcome" element={<Welcome onDone={() => navigate('/', { replace: true })} />} />
        <Route element={<AppShell user={user} onLogout={() => window.location.assign('/login')} />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/subscriptions/:id?" element={<Subscriptions />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/settings/:section?" element={<SettingsLayout />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AppearanceRoot>
  );
}

export function App() {
  useLocale(); // re-render on language change
  const [auth, setAuth] = useState<AuthState | null>(null);

  const refresh = useCallback(async () => {
    setAuth(await api.get<AuthState>('/auth/state'));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!auth) return <p className="p-6 text-sm text-text-3">{t('common.loading')}</p>;

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || undefined}>
      {auth.user ? (
        <SignedIn user={auth.user} />
      ) : (
        <Routes>
          <Route path="/setup" element={auth.setupRequired ? <Setup onDone={() => location.assign('/')} /> : <Navigate to="/login" replace />} />
          <Route path="/login" element={auth.setupRequired ? <Navigate to="/setup" replace /> : <Login />} />
          <Route path="*" element={<Navigate to={auth.setupRequired ? '/setup' : '/login'} replace />} />
        </Routes>
      )}
    </BrowserRouter>
  );
}
