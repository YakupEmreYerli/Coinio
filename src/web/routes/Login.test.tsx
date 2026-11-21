import { describe, expect, it } from 'vitest';
import { safeNext } from './Login';

describe('safeNext', () => {
  it('keeps same-site paths', () => {
    expect(safeNext('/oauth/consent?req=abc')).toBe('/oauth/consent?req=abc');
    expect(safeNext('/settings')).toBe('/settings');
  });

  it('refuses anything a browser could turn into another site', () => {
    for (const raw of ['//evil.com', '/\\evil.com', '/\t/evil.com', '/\n/evil.com', 'https://evil.com', null]) expect(safeNext(raw)).toBe('/');
  });
});
