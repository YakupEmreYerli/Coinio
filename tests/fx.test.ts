import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeTestApp } from './helpers.js';
import { getRates, refreshRates, type FetchFn } from '../src/server/services/fx.js';

const okFetch = (rate: number, date = '2026-11-17'): FetchFn =>
  vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ amount: 1, base: 'USD', date, rates: { TRY: rate } }) }));
const failFetch: FetchFn = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));

afterEach(() => vi.restoreAllMocks());

describe('refreshRates / getRates', () => {
  it('stores 1 X = n base and requests the right URL', async () => {
    const { db } = makeTestApp();
    const f = okFetch(42.5);
    await refreshRates(db, 'TRY', ['USD', 'TRY'], f, '2026-11-18');
    expect(f).toHaveBeenCalledTimes(1);
    expect(f).toHaveBeenCalledWith('https://api.frankfurter.dev/v1/latest?from=USD&to=TRY');
    const r = getRates(db, 'TRY', '2026-11-18');
    expect(r.rates).toEqual({ USD: 42.5 });
    expect(r.date).toBe('2026-11-17');
    expect(r.stale).toBe(false);
  });

  it('keeps the old rate when the fetch fails and does not throw', async () => {
    const { db } = makeTestApp();
    await refreshRates(db, 'TRY', ['USD'], okFetch(42.5), '2026-11-10');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(refreshRates(db, 'TRY', ['USD'], failFetch, '2026-11-18')).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    const r = getRates(db, 'TRY', '2026-11-18');
    expect(r.rates.USD).toBe(42.5);
    expect(r.stale).toBe(true);
  });

  it('keeps the old rate when fetch throws', async () => {
    const { db } = makeTestApp();
    await refreshRates(db, 'TRY', ['USD'], okFetch(42.5), '2026-11-18');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await refreshRates(db, 'TRY', ['USD'], async () => { throw new Error('offline'); }, '2026-11-18');
    expect(getRates(db, 'TRY', '2026-11-18').rates.USD).toBe(42.5);
  });

  it('overwrites the cached rate on success', async () => {
    const { db } = makeTestApp();
    await refreshRates(db, 'TRY', ['USD'], okFetch(42.5), '2026-11-17');
    await refreshRates(db, 'TRY', ['USD'], okFetch(43), '2026-11-18');
    expect(getRates(db, 'TRY', '2026-11-18').rates.USD).toBe(43);
  });

  it('is stale when last fetch is 5 days old', () => {
    const { db } = makeTestApp();
    return refreshRates(db, 'TRY', ['USD'], okFetch(42.5), '2026-11-13').then(() => {
      expect(getRates(db, 'TRY', '2026-11-18').stale).toBe(true);
      expect(getRates(db, 'TRY', '2026-11-17').stale).toBe(false);
    });
  });

  it('is not stale after a Saturday fetch even though the rate date is Friday', async () => {
    const { db } = makeTestApp();
    await refreshRates(db, 'TRY', ['USD'], okFetch(42.5, '2026-11-13'), '2026-11-14');
    expect(getRates(db, 'TRY', '2026-11-14').stale).toBe(false);
  });

  it('reports stale with no rates when nothing is cached', () => {
    const { db } = makeTestApp();
    const r = getRates(db, 'TRY', '2026-11-18');
    expect(r.rates).toEqual({});
    expect(r.stale).toBe(true);
  });
});
