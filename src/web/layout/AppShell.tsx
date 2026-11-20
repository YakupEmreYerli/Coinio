import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useIsMobile } from '../lib/useMediaQuery';
import { ExportMenu } from '../components/ExportMenu';
import { CommandMenu } from './CommandMenu';
import { Sidebar } from './Sidebar';
import { SubscriptionFormHost } from '../subscription-form/SubscriptionFormHost';
import { UserProvider } from '../lib/user';
import { TabBar } from './TabBar';
import { TopBar } from './TopBar';

export function AppShell({ user, onLogout }: { user: { id: number; username: string }; onLogout: () => void }) {
  const mobile = useIsMobile();
  const [cmdOpen, setCmdOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <UserProvider value={user}>
    <SubscriptionFormHost>
      <div className={mobile ? 'flex h-dvh flex-col' : 'grid h-dvh grid-cols-[248px_minmax(0,1fr)]'}>
        {!mobile && <Sidebar />}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <main className="min-h-0 flex-1 overflow-y-auto">
            <TopBar username={user.username} onSearch={() => setCmdOpen(true)} onLogout={onLogout} extra={mobile ? undefined : <ExportMenu />} />
            {/* One broken page shows a fallback instead of a blank app; moving to another page clears it. */}
            <ErrorBoundary resetKey={pathname}>
              <Outlet />
            </ErrorBoundary>
          </main>
          {mobile && <TabBar />}
        </div>
      </div>
      <CommandMenu open={cmdOpen} onOpenChange={setCmdOpen} />
    </SubscriptionFormHost>
    </UserProvider>
  );
}
