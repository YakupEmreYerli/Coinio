import { describe, expect, it } from 'vitest';
import { ApiError } from '../api';
import type { ApiPayment, ApiSubscription, Summary } from '../lib/types';
import { DemoBackend, demoRates, type LogoIndex } from './backend';

const NOW = new Date('2026-03-10T12:00:00Z');
const logos: LogoIndex = {
  domains: { 'netflix.com': 'netflix.svg', 'spotify.com': 'spotify.svg', 'chatgpt.com': 'chatgpt.com.png' },
  brands: [
    { slug: 'netflix', title: 'Netflix', hex: 'E50914' },
    { slug: 'spotify', title: 'Spotify', hex: '1ED760' },
  ],
};

function memoryStorage() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k), map };
}

const make = (storage = memoryStorage(), now = NOW) =>
  new DemoBackend({ now: () => now, storage, timezone: 'UTC', base: '/demo/', loadLogos: async () => logos });

async function rejects(p: Promise<unknown>): Promise<ApiError> {
  const err = await p.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(ApiError);
  return err as ApiError;
}

describe('demo backend', () => {
  it('speaks Turkish in lira with services Turkish visitors know, ChatGPT left in dollars', async () => {
    const b = new DemoBackend({ now: () => NOW, storage: memoryStorage(), timezone: 'UTC', base: '/demo/', locale: 'tr', loadLogos: async () => logos });
    const subs = (await b.handle('GET', '/subscriptions')) as ApiSubscription[];
    expect(subs.find((s) => s.name === 'YouTube Premium')?.currency).toBe('TRY');
    expect(subs.find((s) => s.name === 'ChatGPT Plus')?.currency).toBe('USD');
    expect(((await b.handle('GET', '/summary')) as { base: string }).base).toBe('TRY');
  });

  it('prices samples in euros for German visitors', async () => {
    const b = new DemoBackend({ now: () => NOW, storage: memoryStorage(), timezone: 'UTC', base: '/demo/', locale: 'de', loadLogos: async () => logos });
    const subs = (await b.handle('GET', '/subscriptions')) as ApiSubscription[];
    expect(subs.find((s) => s.name === 'Netflix')?.currency).toBe('EUR');
  });

  it('starts signed in, onboarded, with the sample set in USD and their logos', async () => {
    const b = make();
    expect(await b.handle('GET', '/auth/state')).toEqual({ setupRequired: false, user: { id: 1, username: 'demo' } });
    expect(await b.handle('GET', '/onboarding')).toMatchObject({ completed: true });
    const subs = (await b.handle('GET', '/subscriptions?includeInactive=true')) as ApiSubscription[];
    expect(subs).toHaveLength(8);
    expect(new Set(subs.map((s) => s.currency))).toEqual(new Set(['USD']));
    expect(subs.find((s) => s.name === 'Netflix')).toMatchObject({ logoPath: 'netflix.svg', nextDue: '2026-03-13', category: 'Streaming' });
    expect(subs.find((s) => s.name === 'ChatGPT Plus')?.logoPath).toBe('chatgpt.com.png');
    const summary = (await b.handle('GET', '/summary')) as Summary;
    expect(summary.base).toBe('USD');
    expect(summary.overdue.map((i) => i.name)).toEqual(['Home internet']);
  });

  it('has a year of paid history behind the samples', async () => {
    const pays = (await make().handle('GET', '/payments?status=paid')) as ApiPayment[];
    const report = (await make().handle('GET', '/reports')) as { months: { month: string; paidMinor: number }[] };
    expect(pays.length).toBeGreaterThan(60);
    expect(report.months.find((m) => m.month === '2025-12')!.paidMinor).toBeGreaterThan(0);
  });

  it('marks paid, advances the due date and undoes it', async () => {
    const b = make();
    const internet = ((await b.handle('GET', '/subscriptions')) as ApiSubscription[]).find((s) => s.name === 'Home internet')!;
    expect(internet.nextDue).toBe('2026-03-08');
    const payment = (await b.handle('POST', `/subscriptions/${internet.id}/pay`, {})) as ApiPayment;
    expect(payment).toMatchObject({ dueDate: '2026-03-08', status: 'paid', source: 'manual', amountMinor: 4500 });
    expect(((await b.handle('GET', `/subscriptions/${internet.id}`)) as ApiSubscription).nextDue).toBe('2026-04-08');
    expect(((await b.handle('GET', '/summary')) as Summary).overdue).toHaveLength(0);
    await b.handle('DELETE', `/payments/${payment.id}`);
    expect(((await b.handle('GET', `/subscriptions/${internet.id}`)) as ApiSubscription).nextDue).toBe('2026-03-08');
  });

  it('skips a period without counting it', async () => {
    const b = make();
    const gym = ((await b.handle('GET', '/subscriptions')) as ApiSubscription[]).find((s) => s.name === 'Gym')!;
    const before = (await b.handle('GET', '/summary')) as Summary;
    const skipped = (await b.handle('POST', `/subscriptions/${gym.id}/skip`, {})) as ApiPayment;
    expect(skipped).toMatchObject({ status: 'skipped', amountMinor: 0, dueDate: '2026-03-22' });
    const after = (await b.handle('GET', '/summary')) as Summary;
    expect(after.leftThisMonthMinor).toBe(before.leftThisMonthMinor - 3900);
  });

  it('validates new subscriptions, picks a bundled logo and converts other currencies', async () => {
    const b = make();
    expect((await rejects(b.handle('POST', '/subscriptions', { name: '' }))).status).toBe(400);
    const created = (await b.handle('POST', '/subscriptions', {
      name: 'Spotify Duo', domain: 'spotify.com', amountMinor: 1000, currency: 'EUR', cycle: 'monthly', intervalCount: 1, nextDue: '2026-03-20',
    })) as ApiSubscription;
    expect(created).toMatchObject({ logoPath: 'spotify.svg', anchorDay: 20, active: true });
    const due = ((await b.handle('GET', '/summary')) as Summary).upcoming.find((i) => i.subscriptionId === created.id)!;
    expect(due.baseMinor).toBe(Math.round(1000 * demoRates('USD').rates.EUR!));
  });

  it('pauses and resumes without bringing back missed periods', async () => {
    let now = NOW;
    const storage = memoryStorage();
    const b = new DemoBackend({ now: () => now, storage, timezone: 'UTC', loadLogos: async () => logos });
    const gym = ((await b.handle('GET', '/subscriptions')) as ApiSubscription[]).find((s) => s.name === 'Gym')!;
    await b.handle('PATCH', `/subscriptions/${gym.id}`, { active: false });
    now = new Date('2026-06-01T12:00:00Z');
    const resumed = (await b.handle('PATCH', `/subscriptions/${gym.id}`, { active: true })) as ApiSubscription;
    expect(resumed.nextDue).toBe('2026-06-22');
  });

  it('keeps its data in storage and starts over on reset', async () => {
    const storage = memoryStorage();
    const first = make(storage);
    const created = (await first.handle('POST', '/subscriptions', { name: 'Rent', amountMinor: 120000, currency: 'USD', cycle: 'monthly', intervalCount: 1, nextDue: '2026-04-01' })) as ApiSubscription;
    const second = make(storage);
    expect(((await second.handle('GET', '/subscriptions')) as ApiSubscription[]).some((s) => s.id === created.id)).toBe(true);
    second.reset();
    expect(((await second.handle('GET', '/subscriptions')) as ApiSubscription[]).some((s) => s.name === 'Rent')).toBe(false);
  });

  it('applies the theme asked for by the landing page and saves appearance changes', async () => {
    const b = new DemoBackend({ now: () => NOW, timezone: 'UTC', theme: 'paper' });
    expect(await b.handle('GET', '/appearance')).toMatchObject({ theme: 'paper' });
    await b.setTheme('night');
    expect(await b.handle('GET', '/appearance')).toMatchObject({ theme: 'night' });
  });

  it('offers only bundled logos and maps the plain style to its own file', async () => {
    const b = make();
    const { candidates } = (await b.handle('GET', '/logos/candidates?q=netf&domain=')) as { candidates: { id: string; previewUrl: string }[] };
    expect(candidates).toEqual([expect.objectContaining({ id: 'brand:netflix', previewUrl: '/demo/logos/netflix.svg' })]);
    const gym = ((await b.handle('GET', '/subscriptions')) as ApiSubscription[]).find((s) => s.name === 'Gym')!;
    const updated = (await b.handle('POST', `/subscriptions/${gym.id}/logo/select`, { candidateId: 'brand:netflix', style: 'plain' })) as ApiSubscription;
    expect(updated.logoPath).toBe('netflix-plain.svg');
  });

  it('answers server-only features with demo_unavailable instead of failing', async () => {
    const b = make();
    for (const [method, path] of [
      ['POST', '/keys'], ['POST', '/import/wallos'], ['POST', '/auth/password'], ['POST', '/subscriptions/1/logo'],
      ['POST', '/notifications/channels'], ['POST', '/notifications/channels/test'], ['POST', '/notifications/templates/reminder/test'],
    ] as const) {
      expect(await rejects(b.handle(method, path, {}))).toMatchObject({ status: 403, code: 'demo_unavailable' });
    }
    expect(await b.handle('GET', '/keys')).toEqual([]);
    expect((await rejects(b.handle('GET', '/nope'))).status).toBe(404);
  });

  it('keeps notification settings and templates in memory, without channels', async () => {
    const b = make();
    const page = (await b.handle('GET', '/notifications')) as { settings: { overdue: boolean }; channels: unknown[]; templates: Record<string, { custom: boolean; title: string }> };
    expect(page.channels).toEqual([]);
    await b.handle('PUT', '/notifications/settings', { ...page.settings, overdue: false });
    await b.handle('PUT', '/notifications/templates/reminder', { title: 'Hey {{name}}', body: 'x' });
    const after = (await b.handle('GET', '/notifications')) as typeof page;
    expect(after.settings.overdue).toBe(false);
    expect(after.templates.reminder).toMatchObject({ title: 'Hey {{name}}', custom: true });
    await b.handle('DELETE', '/notifications/templates/reminder');
    expect(((await b.handle('GET', '/notifications')) as typeof page).templates.reminder!.custom).toBe(false);
    expect(await b.handle('GET', '/notifications/log')).toEqual([]);
  });

  it('stores reminder offsets and a trial end on subscriptions', async () => {
    const b = make();
    const s = (await b.handle('POST', '/subscriptions', { name: 'Trial', amountMinor: 100, currency: 'USD', cycle: 'monthly', intervalCount: 1, nextDue: '2026-12-01', reminderOffsets: [2], trialEndsAt: '2026-11-30' })) as ApiSubscription;
    expect(s).toMatchObject({ reminderOffsets: [2], trialEndsAt: '2026-11-30' });
  });
});
