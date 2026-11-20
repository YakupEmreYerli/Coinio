import { describe, expect, it } from 'vitest';
import { CATALOG, CATEGORY_LABELS, searchCatalog } from './catalog';

describe('catalog', () => {
  it('has well over a hundred services', () => {
    expect(CATALOG.length).toBeGreaterThanOrEqual(140);
  });

  it('every entry has a valid domain and category, and ids are unique', () => {
    const ids = new Set<string>();
    for (const s of CATALOG) {
      expect(s.domain, s.name).toMatch(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/);
      expect(CATEGORY_LABELS[s.category], s.name).toBeTruthy();
      expect(ids.has(s.id), s.id).toBe(false);
      ids.add(s.id);
    }
  });

  it('search is case and accent insensitive in tr', () => {
    expect(searchCatalog('İCLOUD')[0]?.name).toBe('iCloud+');
    expect(searchCatalog('exxen')[0]?.name).toBe('Exxen');
    expect(searchCatalog('blu')[0]?.name).toBe('BluTV');
    expect(searchCatalog('youtube.com').some((s) => s.name === 'YouTube Premium')).toBe(true);
  });

  it('prefix matches rank first', () => {
    const r = searchCatalog('net');
    expect(r[0]?.name).toBe('Netflix');
    expect(searchCatalog('na').map((s) => s.name)).not.toContain('YNAB');
    expect(searchCatalog('na').every((s) => /(^|\s)na/i.test(s.name) || s.domain.startsWith('na'))).toBe(true);
    expect(searchCatalog('zzzz')).toEqual([]);
    expect(searchCatalog('')).toEqual([]);
  });
});
