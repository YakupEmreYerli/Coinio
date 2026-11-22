import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ext } from '@coinio/ext';
import { api, onAuthChanged, type AuthState } from './api';
import { addMessages, resolveLocale, setLocale, t, useLocale } from './i18n';
import { SlicedMark } from './brand/SlicedMark';
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

if (ext.messages) addMessages(ext.messages);

const Loading = () => (
  <div className="grid min-h-dvh place-items-center bg-bg" role="status" aria-label={t('common.loading')}>
    <SlicedMark size={44} animated className="opacity-90" />
  </div>
);

/** Signed-in part: keeps language and appearance in sync with the server. */
function SignedIn({ user }: { user: { id: number; username: string } }) {
  const settings = useSettings().data;
  useEffect(() => {
    if (settings) setLocale(resolveLocale(settings.locale, navigator.languages));
  }, [settings]);
  const onboardingQuery = useOnboarding();
  const onboarding = onboardingQuery.data;
  const location = useLocation();
  const navigate = useNavigate();
  // Until we know whether this is a first run, show the loading mark: drawing the app first flashes it before the welcome.
  if (onboardingQuery.isPending) return <Loading />;
  if (onboarding && !onboarding.completed && location.pathname !== '/welcome' && !location.pathname.startsWith('/settings/import')) {
    return <Navigate to="/welcome" replace />;
  }
  return (
    <AppearanceRoot>
      <Routes>
        <Route path="/welcome" element={<Welcome onDone={() => navigate('/', { replace: true })} />} />
        <Route element={<AppShell user={user} onLogout={() => window.location.assign('/login')} />}>
          {ext.routes?.map((r) => <Route key={r.path} path={r.path} element={<r.Component />} />)}
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
    return onAuthChanged(() => void refresh());
  }, [refresh]);

  if (!auth) return <Loading />;

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || undefined}>
      {auth.user ? (
        <SignedIn user={auth.user} />
      ) : (
        <Routes>
          {ext.publicRoutes?.map((r) => <Route key={r.path} path={r.path} element={<r.Component />} />)}
          <Route
            path="/setup"
            element={auth.setupRequired ? ext.SetupScreen ? <ext.SetupScreen /> : <Setup onDone={() => location.assign('/')} /> : <Navigate to="/login" replace />}
          />
          <Route path="/login" element={auth.setupRequired ? <Navigate to="/setup" replace /> : <Login />} />
          <Route path="*" element={<Navigate to={auth.setupRequired ? '/setup' : '/login'} replace />} />
        </Routes>
      )}
    </BrowserRouter>
  );
}
