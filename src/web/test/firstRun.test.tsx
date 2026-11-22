import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { TooltipProvider } from '../components/ui/Tooltip';

const renderWhole = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </QueryClientProvider>,
  );

afterEach(() => vi.unstubAllGlobals());

/** Answers like the server, except that GET /api/onboarding waits until `release` is called. */
function serverWithSlowOnboarding(completed: boolean) {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const path = url.split('?')[0]!;
      if (path === '/api/auth/state') return Response.json({ setupRequired: false, user: { id: 1, username: 'a' } });
      if (path === '/api/onboarding') {
        await gate;
        return Response.json({ completed, hasSamples: false });
      }
      return new Promise<Response>(() => {}); // the rest of the app stays loading; only what is shown matters here
    }),
  );
  return () => release();
}

describe('first run', () => {
  it('shows nothing of the app until it knows whether to welcome a new user', async () => {
    const release = serverWithSlowOnboarding(false);
    window.history.pushState({}, '', '/');
    const { container } = renderWhole();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/onboarding'), expect.anything()));
    await new Promise((r) => setTimeout(r, 50));
    expect(container.querySelector('main')).toBeNull();
    release();
    await vi.waitFor(() => expect(window.location.pathname).toBe('/welcome'));
    expect(container.querySelector('main')).toBeNull();
  });

  it('opens the app once onboarding is done', async () => {
    const release = serverWithSlowOnboarding(true);
    window.history.pushState({}, '', '/');
    const { container } = renderWhole();
    release();
    await vi.waitFor(() => expect(container.querySelector('main')).not.toBeNull());
    expect(window.location.pathname).toBe('/');
  });
});
