import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../i18n';
import { mockApi, renderApp, setViewport, sub } from '../test/render';
import { AppShell } from './AppShell';

const user = { id: 1, username: 'yakup' };

function shell(route = '/') {
  return renderApp(
    <Routes>
      <Route element={<AppShell user={user} onLogout={() => {}} />}>
        <Route path="/" element={<p>home page</p>} />
        <Route path="/settings/:section?" element={<p>settings page</p>} />
        <Route path="/subscriptions" element={<p>subscriptions page</p>} />
      </Route>
    </Routes>,
    { route },
  );
}

beforeEach(() => {
  setLocale('en');
  setViewport(1440);
});
afterEach(() => vi.unstubAllGlobals());

describe('AppShell', () => {
  it('Ctrl+K opens command menu and navigates to settings', async () => {
    mockApi({ 'GET /api/subscriptions': [sub()] });
    shell();
    const u = userEvent.setup();
    await u.keyboard('{Control>}k{/Control}');
    const input = await screen.findByPlaceholderText(/search or jump/i);
    await u.type(input, 'settings');
    await u.keyboard('{Enter}');
    expect(await screen.findByText('settings page')).toBeInTheDocument();
  });

  it('sidebar shows categories from subscriptions', async () => {
    mockApi({ 'GET /api/subscriptions': [sub(), sub({ id: 2, name: 'Claude', category: 'AI' }), sub({ id: 3, name: 'Grok', category: 'AI' })] });
    shell();
    const nav = await screen.findByRole('navigation', { name: /categories/i });
    expect(await within(nav).findByText('AI')).toBeInTheDocument();
    expect(within(nav).getByText('Eğlence')).toBeInTheDocument();
    expect(within(nav).getByText('2')).toBeInTheDocument();
  });

  it('tab bar visible under 760px', async () => {
    mockApi({});
    setViewport(390);
    shell();
    expect(await screen.findByRole('navigation', { name: /tabs/i })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: /main/i })).not.toBeInTheDocument();
  });

  it('logout calls /api/auth/logout', async () => {
    const calls = mockApi({});
    const onLogout = vi.fn();
    renderApp(
      <Routes>
        <Route element={<AppShell user={user} onLogout={onLogout} />}>
          <Route path="/" element={<p>home</p>} />
        </Route>
      </Routes>,
    );
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: /account menu/i }));
    await u.click(await screen.findByRole('menuitem', { name: /log out/i }));
    await vi.waitFor(() => expect(calls).toContainEqual(expect.objectContaining({ method: 'POST', url: '/api/auth/logout' })));
    await vi.waitFor(() => expect(onLogout).toHaveBeenCalled());
  });
});
