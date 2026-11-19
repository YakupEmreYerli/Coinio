import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Minimal stand-ins for the Scriptable APIs the widget uses; texts are collected for assertions. */
function sandbox(family: string, response: unknown, opts: { fail?: boolean; cached?: string } = {}) {
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
  const g = {
    ListWidget,
    Font: new Proxy({}, { get: () => () => ({}) }),
    Color: Object.assign(function Color() {}, { dynamic: () => ({}), gray: () => ({}), orange: () => ({}) }),
    Size: function Size() {},
    Request: class {
      headers = {};
      timeoutInterval = 0;
      async loadJSON() {
        if (opts.fail) throw new Error('offline');
        return response;
      }
    },
    FileManager: { local: () => ({ documentsDirectory: () => '/docs', joinPath: (a: string, b: string) => `${a}/${b}`, writeString: (p: string, s: string) => files.set(p, s), fileExists: (p: string) => files.has(p), readString: (p: string) => files.get(p) }) },
    Device: { language: () => 'tr' },
    config: { widgetFamily: family, runsInWidget: true },
    Script: { setWidget: (w: unknown) => (shown = w), complete: () => {} },
  };
  const src = readFileSync('widget/coinio-widget.js', 'utf8').replace('https://subs.example.com', 'https://subs.test');
  const run = new Function(...Object.keys(g), `return (async () => {${src}})();`);
  return { texts, files, done: run(...Object.values(g)) as Promise<void>, shown: () => shown };
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
    expect(s.texts).toContain('çevrimdışı');
    expect(s.texts.join(' ')).toContain('Hetzner VPS');
  });
});
