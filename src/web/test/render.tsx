import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { Toaster } from '../components/ui/Toaster';
import { TooltipProvider } from '../components/ui/Tooltip';

export type Route = (url: string, init: RequestInit & { method: string }) => unknown;

/** Stubs fetch with a tiny router: return a value (JSON 200), a Response, or undefined (404). Records calls. */
export function mockApi(routes: Record<string, unknown | ((init: RequestInit & { method: string; url: string }) => unknown)>) {
  const calls: { method: string; url: string; body?: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
      calls.push({ method, url, body });
      const path = url.split('?')[0]!;
      const handler = routes[`${method} ${url}`] ?? routes[`${method} ${path}`];
      const value = typeof handler === 'function' ? (handler as (i: unknown) => unknown)({ ...init, method, url }) : handler;
      if (value instanceof Response) return value;
      if (value === undefined) return method === 'GET' ? new Response('[]', { status: 200 }) : new Response(null, { status: 204 });
      return new Response(JSON.stringify(value), { status: method === 'POST' ? 201 : 200 });
    }),
  );
  return calls;
}

export function renderApp(ui: ReactElement, { route = '/' }: { route?: string } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

export function setViewport(width: number) {
  window.matchMedia = ((query: string) => {
    const max = /max-width:\s*(\d+)px/.exec(query);
    const min = /min-width:\s*(\d+)px/.exec(query);
    const matches = (max ? width <= Number(max[1]) : true) && (min ? width >= Number(min[1]) : true);
    return { matches, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false };
  }) as unknown as typeof window.matchMedia;
}

export const sub = (over: Record<string, unknown> = {}) => ({
  id: 1, name: 'Netflix', domain: 'netflix.com', logoPath: null, amountMinor: 19999, currency: 'TRY', variableAmount: false,
  cycle: 'monthly', intervalCount: 1, anchorDay: 22, nextDue: '2026-11-22', autoPay: true, paymentMethod: 'Kart',
  category: 'Eğlence', notes: null, reminderOffsets: null, trialEndsAt: null, active: true, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z',
  ...over,
});
