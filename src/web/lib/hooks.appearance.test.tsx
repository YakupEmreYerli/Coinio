import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_APPEARANCE } from '../../shared/appearance';
import { useSaveAppearance } from './hooks';
import { keys } from './query';

afterEach(() => vi.unstubAllGlobals());

describe('useSaveAppearance', () => {
  it('a slow save response never overwrites a newer local edit', async () => {
    let release!: () => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((r) => (release = () => r(new Response(JSON.stringify({ ...DEFAULT_APPEARANCE, customCss: 'a' }), { status: 200 }))))));
    const qc = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useSaveAppearance(), { wrapper });
    act(() => result.current.mutate({ ...DEFAULT_APPEARANCE, customCss: 'a' }));
    expect(qc.getQueryData<typeof DEFAULT_APPEARANCE>(keys.appearance)?.customCss).toBe('a');
    qc.setQueryData(keys.appearance, { ...DEFAULT_APPEARANCE, customCss: 'ab' });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    await act(async () => release());
    await vi.waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(qc.getQueryData<typeof DEFAULT_APPEARANCE>(keys.appearance)?.customCss).toBe('ab');
  });
});
