import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Minimal stand-ins for the Scriptable APIs the widget uses; texts are collected for assertions. */
function sandbox(family: string, response: unknown, opts: { fail?: boolean; cached?: string; status?: number; url?: string; language?: string } = {}) {
  const texts: string[] = [];
  const node = () => {
    const n: Record<string, unknown> = {
      addText: (t: string) => (texts.push(t), {}),
      addStack: () => node(),
      addSpacer: () => {},
      setPadding: () => {},
      centerAlignContent: () => {},
    };
    return n;
  };
  class ListWidget {
    constructor() {
      Object.assign(this, node());
    }
  }
  const files = new Map<string, string>(opts.cached ? [['/docs/coinio-widget.json', opts.cached]] : []);
  let shown: unknown = null;
  const urls: string[] = [];
  const g = {
    ListWidget,
    Font: new Proxy({}, { get: () => () => ({}) }),
    Color: Object.assign(function Color() {}, { dynamic: () => ({}), gray: () => ({}), orange: () => ({}) }),
    Size: function Size() {},
    Request: class {
      headers = {};
      timeoutInterval = 0;
      response = { statusCode: opts.status ?? 200 };
      constructor(url: string) {
        urls.push(url);
      }
      async loadJSON() {
        if (opts.fail) throw new Error('offline');
        return response;
      }
    },
    FileManager: { local: () => ({ documentsDirectory: () => '/docs', joinPath: (a: string, b: string) => `${a}/${b}`, writeString: (p: string, s: string) => files.set(p, s), fileExists: (p: string) => files.has(p), readString: (p: string) => files.get(p) }) },
    Device: { language: () => opts.language ?? 'tr' },
    config: { widgetFamily: family, runsInWidget: true },
    Script: { setWidget: (w: unknown) => (shown = w), complete: () => {} },
  };
  const src = readFileSync('widget/coinio-widget.js', 'utf8').replace('https://subs.example.com', opts.url ?? 'https://subs.test');
  const run = new Function(...Object.keys(g), `return (async () => {${src}})();`);
  return { texts, files, urls, done: run(...Object.values(g)) as Promise<void>, shown: () => shown };
}

const data = {
  base: 'TRY',
  leftThisMonthMinor: 221799,
  monthlyAverageMinor: 897997,
  ratesStale: false,
  generatedAt: '2026-11-19T10:00:00Z',
  items: [
    { subscriptionId: 1, name: 'Hetzner VPS', dueDate: '2026-11-17', daysLeft: -2, amountMinor: 125000, currency: 'TRY', baseMinor: 125000 },
    { subscriptionId: 2, name: 'ChatGPT Plus', dueDate: '2026-11-22', daysLeft: 3, amountMinor: 2000, currency: 'USD', baseMinor: 86800 },
    { subscriptionId: 3, name: 'Trendyol Plus', dueDate: '2026-11-28', daysLeft: 9, amountMinor: 9999, currency: 'TRY', baseMinor: 9999 },
  ],
};

describe('Scriptable widget script', () => {
  it('medium widget shows the month total and the next payments', async () => {
    const s = sandbox('medium', data);
    await s.done;
    expect(s.shown()).not.toBeNull();
    expect(s.texts).toContain('Bu ay kalan');
    expect(s.texts.join(' ')).toMatch(/Hetzner VPS.*ChatGPT Plus.*Trendyol Plus/);
  });

  it('follows the device language, with English for the rest', async () => {
    const ja = sandbox('medium', data, { language: 'ja' });
    await ja.done;
    expect(ja.texts).toContain('今月の残り');
    const pt = sandbox('medium', data, { language: 'pt-PT' });
    await pt.done;
    expect(pt.texts).toContain('Falta este mês');
    const ko = sandbox('medium', data, { language: 'ko' });
    await ko.done;
    expect(ko.texts).toContain('Left this month');
  });

  it('lock screen marks overdue with a warning sign', async () => {
    const s = sandbox('accessoryRectangular', data);
    await s.done;
    expect(s.texts).toContain('⚠ Hetzner VPS');
  });

  it('inline widget is one line with the nearest payment', async () => {
    const s = sandbox('accessoryInline', data);
    await s.done;
    expect(s.texts[0]).toMatch(/^Hetzner VPS · 17 Kas · /);
  });

  it('falls back to the cached response and says offline', async () => {
    const s = sandbox('small', null, { fail: true, cached: JSON.stringify(data) });
    await s.done;
    expect(s.texts.some((x) => /^çevrimdışı · \d\d:\d\d$/.test(x))).toBe(true);
    expect(s.texts.join(' ')).toContain('Hetzner VPS');
  });

  it('a rejected key says so instead of showing old data as offline', async () => {
    const s = sandbox('medium', { error: 'invalid_token' }, { status: 401, cached: JSON.stringify(data) });
    await s.done;
    expect(s.texts).toEqual(["API anahtarı kabul edilmedi, API_KEY'i kontrol et"]);
  });

  it('without a connection or cache it says the server cannot be reached', async () => {
    const s = sandbox('medium', null, { fail: true });
    await s.done;
    expect(s.texts).toEqual(["Coinio'ya ulaşılamıyor"]);
  });

  it('tolerates a trailing slash in SERVER_URL', async () => {
    const s = sandbox('medium', data, { url: 'https://subs.test/' });
    await s.done;
    expect(s.urls).toEqual(['https://subs.test/api/widget']);
  });

  it('medium rows show the due date next to the amount', async () => {
    const s = sandbox('medium', data);
    await s.done;
    expect(s.texts).toContain('22 Kas · ₺868');
  });

  it('circular lock screen widget shows days to the next payment', async () => {
    const s = sandbox('accessoryCircular', { ...data, items: data.items.slice(1) });
    await s.done;
    expect(s.texts).toEqual(['3', 'ChatGPT Plus']);
  });
});
