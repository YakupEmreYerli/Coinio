import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/server/config.js';
import type { LookupFn, ServiceCtx } from '../src/server/services/context.js';
import { BlockedAddressError, assertPublicSmtpHost, guardedFetch, isPrivateAddress } from '../src/server/services/netGuard.js';

const lookupTo = (map: Record<string, string>): LookupFn => async (host) => {
  const address = map[host];
  if (!address) throw new Error('ENOTFOUND');
  return [{ address, family: address.includes(':') ? 6 : 4 }];
};

function ctxWith(opts: { block: boolean; fetch?: ReturnType<typeof vi.fn>; lookup?: LookupFn }): ServiceCtx {
  return {
    db: undefined as never,
    config: { ...loadConfig({}), blockPrivateNetworks: opts.block },
    fetch: (opts.fetch ?? vi.fn(async () => new Response('ok'))) as unknown as typeof fetch,
    now: () => new Date(),
    lookup: opts.lookup ?? lookupTo({ 'hooks.example.com': '93.184.216.34' }),
  };
}

describe('isPrivateAddress', () => {
  it.each(['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '64:ff9b::a00:1', 'ff02::1'])(
    '%s is private',
    (a) => expect(isPrivateAddress(a)).toBe(true),
  );
  it.each(['93.184.216.34', '2606:4700::1111', '::ffff:8.8.8.8', '1.1.1.1'])('%s is public', (a) => expect(isPrivateAddress(a)).toBe(false));
});

describe('guardedFetch', () => {
  it('refuses a host that resolves to a private address without sending anything', async () => {
    const f = vi.fn();
    const ctx = ctxWith({ block: true, fetch: f, lookup: lookupTo({ 'evil.example.com': '10.0.0.5' }) });
    await expect(guardedFetch(ctx, 'https://evil.example.com/x', {})).rejects.toBeInstanceOf(BlockedAddressError);
    expect(f).not.toHaveBeenCalled();
  });

  it('refuses private IP literals and non-http schemes', async () => {
    const ctx = ctxWith({ block: true });
    await expect(guardedFetch(ctx, 'http://169.254.169.254/latest', {})).rejects.toBeInstanceOf(BlockedAddressError);
    await expect(guardedFetch(ctx, 'http://localhost:8080/', {})).rejects.toBeInstanceOf(BlockedAddressError);
    await expect(guardedFetch(ctx, 'ftp://hooks.example.com/', {})).rejects.toBeInstanceOf(BlockedAddressError);
  });

  it('does not follow a redirect to a private address', async () => {
    const f = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/admin' } }));
    const ctx = ctxWith({ block: true, fetch: f });
    await expect(guardedFetch(ctx, 'https://hooks.example.com/x', { method: 'POST' })).rejects.toBeInstanceOf(BlockedAddressError);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('follows a redirect to another public host', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 307, headers: { location: 'https://hooks.example.com/final' } }))
      .mockResolvedValueOnce(new Response('done'));
    const ctx = ctxWith({ block: true, fetch: f });
    const res = await guardedFetch(ctx, 'https://hooks.example.com/x', { method: 'POST', body: '{}' });
    expect(await res.text()).toBe('done');
    expect(f.mock.calls[1]![0]).toBe('https://hooks.example.com/final');
  });

  it('passes everything through when the guard is off', async () => {
    const f = vi.fn(async () => new Response('ok'));
    const ctx = ctxWith({ block: false, fetch: f });
    await guardedFetch(ctx, 'http://localhost:8080/notify', { method: 'POST' });
    expect(f).toHaveBeenCalledWith('http://localhost:8080/notify', expect.objectContaining({ method: 'POST' }));
  });
});

describe('assertPublicSmtpHost', () => {
  it('returns the public address to connect to, and refuses private ones', async () => {
    const ctx = ctxWith({ block: true, lookup: lookupTo({ 'smtp.example.com': '93.184.216.40', 'mail.internal.example': '10.0.0.2' }) });
    expect(await assertPublicSmtpHost(ctx, 'smtp.example.com')).toBe('93.184.216.40');
    await expect(assertPublicSmtpHost(ctx, 'mail.internal.example')).rejects.toBeInstanceOf(BlockedAddressError);
    await expect(assertPublicSmtpHost(ctx, '127.0.0.1')).rejects.toBeInstanceOf(BlockedAddressError);
  });

  it('leaves the host alone when the guard is off', async () => {
    expect(await assertPublicSmtpHost(ctxWith({ block: false }), 'localhost')).toBe('localhost');
  });
});
