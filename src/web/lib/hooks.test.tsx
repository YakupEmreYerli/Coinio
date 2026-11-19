import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '../components/ui/Toaster';
import { usePay } from './hooks';

afterEach(() => vi.unstubAllGlobals());

describe('hooks', () => {
  it('usePay shows undo toast and undo calls DELETE /api/payments/:id', async () => {
    const calls: { url: string; method: string }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? 'GET' });
      if (url === '/api/subscriptions/1/pay') return new Response(JSON.stringify({ id: 7 }), { status: 201 });
      if (url === '/api/payments/7') return new Response(null, { status: 204 });
      return new Response('[]', { status: 200 });
    }));
    const qc = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>
        {children}
        <Toaster />
      </QueryClientProvider>
    );
    const { result } = renderHook(() => usePay(), { wrapper });
    await act(() => result.current.mutateAsync({ id: 1, name: 'Netflix' }));
    await userEvent.setup().click(await screen.findByRole('button', { name: /undo|geri al/i }));
    await vi.waitFor(() => expect(calls).toContainEqual({ url: '/api/payments/7', method: 'DELETE' }));
  });
});
