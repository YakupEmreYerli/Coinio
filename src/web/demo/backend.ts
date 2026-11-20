// In-browser stand-in for the Coinio server, used only by the demo build (VITE_DEMO=1).
// It answers the same /api routes the web app calls, keeps its data in memory and in
// sessionStorage, and reuses the server's pure logic (schedule, summary, report, validation).
import { ZodError } from 'zod';
import { mergeAppearance, Appearance as AppearanceSchema, type Appearance } from '../../shared/appearance';
import { CATEGORY_LABELS } from '../../shared/catalog';
import type { Locale } from '../../shared/locales';
import { defaultTemplates } from '../../shared/notify/defaults';
import { DEFAULT_NOTIFY_SETTINGS, mergeNotifySettings, NOTIFY_TYPES, NotifySettings, TemplateText, type NotifyType } from '../../shared/notify/types';
import { SAMPLE_CURRENCY, SAMPLE_RATES, samplesFor, sampleWord } from '../../shared/sampleData';
import { dueDatesThrough, nextDue, todayIn } from '../../shared/schedule';
import { PaymentPatch, PaymentQuery, PayInput, SettingsPatch, SkipInput, SubscriptionInput, SubscriptionPatch, type Settings } from '../../shared/types';
import type { Rates } from '../../server/domain/money';
import { computeReport } from '../../server/domain/report';
import { computeSummary, type PaymentRow, type SubscriptionRow } from '../../server/domain/summary';
import { ApiError } from '../api';

/** Logos shipped with the demo: domain → file under `<base>logos/`, plus the brand list for the logo picker. */
export type LogoIndex = { domains: Record<string, string>; brands: { slug: string; title: string; hex: string }[] };

type State = {
  version: 1;
  nextId: number;
  subs: SubscriptionRow[];
  payments: PaymentRow[];
  settings: Settings;
  appearance: Appearance;
  /** Notification settings and edited templates, kept like the rest; channels and sending need a server. */
  notify?: NotifySettings;
  notifyTemplates?: Partial<Record<NotifyType, TemplateText>>;
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type DemoOptions = {
  now?: () => Date;
  storage?: StorageLike | null;
  /** Loads the logo index once; a failure only means no logos. */
  loadLogos?: () => Promise<LogoIndex>;
  /** Public base path of the demo ("/demo/"), used for logo preview URLs. */
  base?: string;
  timezone?: string;
  /** Theme to show on the first load, overriding a stored one (the landing page passes its own). */
  theme?: 'night' | 'paper' | null;
  /** Language asked for by the landing page (`?lang=`); wins over a stored one. */
  locale?: Locale | null;
  /** Language of a fresh demo when none is asked for. */
  defaultLocale?: Locale;
  /** Theme of a fresh demo when none is asked for. */
  defaultTheme?: 'night' | 'paper';
};

const STORAGE_KEY = 'coinio.demo';
const USER = { id: 1, username: 'demo' };
const SAMPLE_HISTORY_MONTHS = 12;

export const UNAVAILABLE = 'demo_unavailable';
const unavailable = () => new ApiError(403, UNAVAILABLE);
const notFound = () => new ApiError(404, 'not_found');

const dayOf = (date: string) => Number(date.slice(8, 10));
const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const addMonths = (date: string, months: number) => {
  const [y, m] = date.split('-').map(Number) as [number, number];
  const index = y * 12 + (m - 1) + months;
  const ny = Math.floor(index / 12);
  const nm = (index % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(dayOf(date), last)).padStart(2, '0')}`;
};
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

/** Fixed sample rates (no network): rates[X] = base units per one X. */
export function demoRates(base: string): Rates {
  const perUsd = SAMPLE_RATES[base];
  const rates: Record<string, number> = {};
  if (perUsd) for (const [code, r] of Object.entries(SAMPLE_RATES)) if (code !== base) rates[code] = perUsd / r;
  return { base, date: '', stale: false, rates };
}

export class DemoBackend {
  private state: State | null = null;
  private logos: LogoIndex | null = null;
  private logosLoading: Promise<void> | null = null;
  private readonly now: () => Date;
  private readonly storage: StorageLike | null;
  private readonly base: string;
  private readonly timezone: string;

  constructor(private readonly opts: DemoOptions = {}) {
    this.now = opts.now ?? (() => new Date());
    this.storage = opts.storage ?? null;
    this.base = opts.base ?? '/';
    this.timezone = opts.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
  }

  private today(): string {
    return todayIn(this.load().settings.timezone, this.now());
  }

  private stamp(): string {
    return this.now().toISOString();
  }

  private async ensureLogos(): Promise<void> {
    if (this.logos || !this.opts.loadLogos) return;
    this.logosLoading ??= this.opts
      .loadLogos()
      .then((index) => void (this.logos = index))
      .catch(() => void (this.logos = { domains: {}, brands: [] }));
    await this.logosLoading;
  }

  private logoFor(domain: string | null): string | null {
    return domain ? (this.logos?.domains[domain] ?? null) : null;
  }

  /** Current state: from storage, else freshly seeded; auto-pay is applied on every load. */
  private load(): State {
    if (!this.state) {
      let stored: State | null = null;
      try {
        const raw = this.storage?.getItem(STORAGE_KEY);
        const parsed = raw ? (JSON.parse(raw) as State) : null;
        if (parsed?.version === 1 && Array.isArray(parsed.subs)) stored = parsed;
      } catch {
        // blocked or corrupt storage: start over
      }
      this.state = stored ?? this.seed();
      if (this.opts.theme) this.state.appearance = { ...this.state.appearance, theme: this.opts.theme };
      if (this.opts.locale) this.state.settings = { ...this.state.settings, locale: this.opts.locale };
      this.runAutoPay();
    }
    return this.state;
  }

  private save(): void {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // storage full or blocked: the demo keeps working in memory
    }
  }

  /** The sample set in the visitor's language and currency, with a year of payment history behind it. */
  private seed(): State {
    const locale = this.opts.locale ?? this.opts.defaultLocale ?? 'en';
    const settings: Settings = { baseCurrency: SAMPLE_CURRENCY[locale], timezone: this.timezone, locale, reminderTime: '09:00' };
    const today = todayIn(settings.timezone, this.now());
    const state: State = { version: 1, nextId: 1, subs: [], payments: [], settings, appearance: mergeAppearance({ theme: this.opts.defaultTheme ?? 'night' }) };
    for (const s of samplesFor(locale, settings.baseCurrency, { foreignExample: true })) {
      const due = addDays(today, s.dueIn);
      const start = addMonths(due, -SAMPLE_HISTORY_MONTHS);
      const id = state.nextId++;
      state.subs.push({
        id, userId: USER.id, name: sampleWord(s.name, settings.locale), domain: s.domain, logoPath: this.logoFor(s.domain), amountMinor: s.amountMinor, currency: s.currency,
        variableAmount: false, cycle: s.cycle, intervalCount: 1, anchorDay: dayOf(due), nextDue: due, autoPay: s.autoPay,
        paymentMethod: sampleWord(s.paymentMethod, settings.locale), category: CATEGORY_LABELS[s.category][settings.locale], notes: null, reminderOffsets: null, trialEndsAt: null, active: true,
        createdAt: `${start}T09:00:00.000Z`, updatedAt: `${start}T09:00:00.000Z`,
      });
      for (const d of dueDatesThrough(start, addDays(due, -1), s.cycle, 1, dayOf(due))) {
        state.payments.push({
          id: state.nextId++, subscriptionId: id, dueDate: d, paidAt: `${d}T09:00:00.000Z`, amountMinor: s.amountMinor, currency: s.currency,
          actualBaseMinor: null, source: s.autoPay ? 'auto' : 'manual', status: 'paid',
        });
      }
    }
    return state;
  }

  /** Same rule as the server's daily job: due auto-pay dates become paid, next_due moves past today. */
  private runAutoPay(): void {
    const st = this.state!;
    const today = todayIn(st.settings.timezone, this.now());
    for (const sub of st.subs) {
      if (!sub.autoPay || !sub.active || sub.nextDue > today) continue;
      for (const d of dueDatesThrough(sub.nextDue, today, sub.cycle, sub.intervalCount, sub.anchorDay)) {
        if (st.payments.some((p) => p.subscriptionId === sub.id && p.dueDate === d)) continue;
        st.payments.push({ id: st.nextId++, subscriptionId: sub.id, dueDate: d, paidAt: this.stamp(), amountMinor: sub.amountMinor, currency: sub.currency, actualBaseMinor: null, source: 'auto', status: 'paid' });
      }
      let next = sub.nextDue;
      while (next <= today) next = nextDue(next, sub.cycle, sub.intervalCount, sub.anchorDay);
      sub.nextDue = next;
    }
  }

  reset(): void {
    try {
      this.storage?.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    this.state = null;
  }

  /** The landing page passes its theme in; dark maps to Night, light to Paper. */
  async setTheme(theme: 'night' | 'paper'): Promise<void> {
    await this.ensureLogos();
    const st = this.load();
    if (st.appearance.theme === theme) return;
    st.appearance = { ...st.appearance, theme };
    this.save();
  }

  async handle(method: string, path: string, body?: unknown): Promise<unknown> {
    await this.ensureLogos();
    try {
      const result = this.route(method.toUpperCase(), new URL(path, 'http://demo'), body);
      if (method.toUpperCase() !== 'GET') this.save();
      // Copy so callers never hold live state.
      return result === undefined ? undefined : structuredClone(result);
    } catch (err) {
      if (err instanceof ZodError) throw new ApiError(400, 'validation');
      throw err;
    }
  }

  private sub(id: number): SubscriptionRow {
    const s = this.load().subs.find((x) => x.id === id);
    if (!s) throw notFound();
    return s;
  }

  private route(method: string, url: URL, body: unknown): unknown {
    const st = this.load();
    const parts = url.pathname.split('/').filter(Boolean);
    const [a, b, c] = parts;
    const key = `${method} /${a ?? ''}`;
    const id = b !== undefined ? Number(b) : NaN;

    switch (key) {
      case 'GET /auth':
        if (b === 'state') return { setupRequired: false, user: USER };
        break;
      case 'POST /auth':
        if (b === 'logout') return undefined;
        throw unavailable();
      case 'GET /onboarding':
        return { completed: true, hasSamples: false };
      case 'POST /onboarding':
        return b === 'samples' ? { ids: [] } : undefined;
      case 'DELETE /onboarding':
        return undefined;
      case 'GET /settings':
        return this.maskedSettings();
      case 'PATCH /settings': {
        const v = SettingsPatch.parse(body ?? {});
        st.settings = { ...st.settings, ...Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined)) };
        return this.maskedSettings();
      }
      case 'POST /settings':
        throw unavailable();
      case 'GET /notifications':
        if (b === 'log') return [];
        return this.notifications();
      case 'PUT /notifications':
        if (b === 'settings') {
          st.notify = NotifySettings.parse(body);
          return st.notify;
        }
        if (b === 'templates' && c && (NOTIFY_TYPES as readonly string[]).includes(c)) {
          const tpl = TemplateText.parse(body);
          st.notifyTemplates = { ...st.notifyTemplates, [c]: tpl };
          return tpl;
        }
        break;
      case 'DELETE /notifications':
        if (b === 'templates' && c) {
          const { [c as NotifyType]: _drop, ...rest } = st.notifyTemplates ?? {};
          st.notifyTemplates = rest;
          return undefined;
        }
        throw unavailable();
      case 'POST /notifications':
      case 'PATCH /notifications':
        throw unavailable();
      case 'GET /appearance':
        return st.appearance;
      case 'PUT /appearance':
        st.appearance = mergeAppearance(AppearanceSchema.parse(body));
        return st.appearance;
      case 'GET /summary':
        return computeSummary({ subs: st.subs, payments: st.payments, today: this.today(), rates: demoRates(st.settings.baseCurrency) });
      case 'GET /reports':
        return computeReport({ subs: st.subs, payments: st.payments, today: this.today(), rates: demoRates(st.settings.baseCurrency) });
      case 'GET /logos':
        if (b === 'candidates') return { candidates: this.candidates(url.searchParams.get('q') ?? '', url.searchParams.get('domain') ?? '') };
        break;
      case 'GET /keys':
      case 'GET /oauth':
        return [];
      case 'POST /keys':
      case 'DELETE /keys':
      case 'DELETE /oauth':
      case 'POST /import':
        throw unavailable();
      case 'GET /subscriptions':
        if (b === undefined) {
          const all = url.searchParams.get('includeInactive') === 'true';
          return st.subs.filter((s) => all || s.active).sort((x, y) => x.nextDue.localeCompare(y.nextDue) || x.id - y.id);
        }
        return this.sub(id);
      case 'POST /subscriptions':
        if (b === undefined) return this.create(body);
        if (c === 'pay') return this.pay(id, PayInput.parse(body ?? {}));
        if (c === 'skip') return this.skip(id, SkipInput.parse(body ?? {}).dueDate);
        if (c === 'logo' && parts[3] === 'select') return this.selectLogo(id, body);
        if (c === 'logo') throw unavailable();
        break;
      case 'PATCH /subscriptions':
        return this.update(id, body);
      case 'DELETE /subscriptions':
        if (c === 'logo') {
          const s = this.sub(id);
          s.logoPath = null;
          s.updatedAt = this.stamp();
          return s;
        }
        this.sub(id);
        st.subs = st.subs.filter((s) => s.id !== id);
        st.payments = st.payments.filter((p) => p.subscriptionId !== id);
        return undefined;
      case 'GET /payments':
        return this.listPayments(PaymentQuery.parse(Object.fromEntries(url.searchParams)));
      case 'PATCH /payments':
        return this.updatePayment(id, body);
      case 'DELETE /payments':
        this.undo(id);
        return undefined;
    }
    throw notFound();
  }

  private maskedSettings(): Settings {
    return { ...this.load().settings };
  }

  /** Same shape as GET /api/notifications; the demo has no channels. */
  private notifications() {
    const st = this.load();
    const defaults = defaultTemplates(st.settings.locale);
    const custom = st.notifyTemplates ?? {};
    return {
      settings: st.notify ? mergeNotifySettings(st.notify) : DEFAULT_NOTIFY_SETTINGS,
      channels: [],
      templates: Object.fromEntries(NOTIFY_TYPES.map((t) => [t, { ...(custom[t] ?? defaults[t]), custom: t in custom }])),
      defaults,
      appUrl: null,
    };
  }

  private create(input: unknown): SubscriptionRow {
    const st = this.load();
    const v = SubscriptionInput.parse(input);
    const stamp = this.stamp();
    const row: SubscriptionRow = {
      id: st.nextId++, userId: USER.id, name: v.name, domain: v.domain ?? null, logoPath: this.logoFor(v.domain ?? null),
      amountMinor: v.amountMinor, currency: v.currency, variableAmount: v.variableAmount, cycle: v.cycle, intervalCount: v.intervalCount,
      anchorDay: dayOf(v.nextDue), nextDue: v.nextDue, autoPay: v.autoPay, paymentMethod: v.paymentMethod ?? null, category: v.category ?? null,
      notes: v.notes ?? null, reminderOffsets: v.reminderOffsets, trialEndsAt: v.trialEndsAt, active: true, createdAt: stamp, updatedAt: stamp,
    };
    st.subs.push(row);
    return row;
  }

  private update(id: number, patch: unknown): SubscriptionRow {
    const v = SubscriptionPatch.parse(patch ?? {});
    const s = this.sub(id);
    const before = { ...s };
    for (const [k, val] of Object.entries(v)) if (val !== undefined) (s as Record<string, unknown>)[k] = val;
    if (v.nextDue !== undefined) s.anchorDay = dayOf(v.nextDue);
    if (v.domain !== undefined && v.domain !== before.domain) s.logoPath = this.logoFor(v.domain ?? null) ?? s.logoPath;
    // Resuming never brings back the periods missed while paused (same rule as the server).
    if (v.active === true && !before.active && (v.nextDue === undefined || v.nextDue === before.nextDue)) {
      const today = this.today();
      if (before.nextDue < today) {
        const past = dueDatesThrough(before.nextDue, today, s.cycle, s.intervalCount, before.anchorDay);
        const last = past[past.length - 1]!;
        s.nextDue = last === today ? today : nextDue(last, s.cycle, s.intervalCount, before.anchorDay);
      }
    }
    s.updatedAt = this.stamp();
    return s;
  }

  private findPayment(subId: number, dueDate: string): PaymentRow | undefined {
    return this.load().payments.find((p) => p.subscriptionId === subId && p.dueDate === dueDate);
  }

  /** The cycle after next_due, stepping over dates already settled. */
  private nextOpenDue(sub: SubscriptionRow): string {
    let d = nextDue(sub.nextDue, sub.cycle, sub.intervalCount, sub.anchorDay);
    for (let guard = 0; guard < 500; guard++) {
      const taken = this.findPayment(sub.id, d);
      if (!taken || taken.status === 'void') break;
      d = nextDue(d, sub.cycle, sub.intervalCount, sub.anchorDay);
    }
    return d;
  }

  private pay(id: number, opts: { dueDate?: string; actualBaseMinor?: number; amountMinor?: number }): PaymentRow {
    const st = this.load();
    const sub = this.sub(id);
    const dueDate = opts.dueDate ?? sub.nextDue;
    const existing = this.findPayment(id, dueDate);
    if (existing?.status === 'paid') return existing;
    const values = { paidAt: this.stamp(), amountMinor: opts.amountMinor ?? sub.amountMinor, currency: sub.currency, actualBaseMinor: opts.actualBaseMinor ?? null, status: 'paid' as const };
    let payment: PaymentRow;
    if (existing) payment = Object.assign(existing, values);
    else st.payments.push((payment = { id: st.nextId++, subscriptionId: id, dueDate, source: 'manual', ...values }));
    if (dueDate === sub.nextDue) {
      sub.nextDue = this.nextOpenDue(sub);
      sub.updatedAt = this.stamp();
    }
    return payment;
  }

  private skip(id: number, due?: string): PaymentRow {
    const st = this.load();
    const sub = this.sub(id);
    const dueDate = due ?? sub.nextDue;
    const existing = this.findPayment(id, dueDate);
    if (existing && existing.status !== 'void') return existing;
    const values = { paidAt: this.stamp(), amountMinor: 0, currency: sub.currency, actualBaseMinor: null, status: 'skipped' as const, source: 'manual' as const };
    let payment: PaymentRow;
    if (existing) payment = Object.assign(existing, values);
    else st.payments.push((payment = { id: st.nextId++, subscriptionId: id, dueDate, ...values }));
    if (dueDate === sub.nextDue) {
      sub.nextDue = this.nextOpenDue(sub);
      sub.updatedAt = this.stamp();
    }
    return payment;
  }

  private undo(paymentId: number): void {
    const st = this.load();
    const payment = st.payments.find((p) => p.id === paymentId);
    if (!payment) throw notFound();
    if (payment.source === 'auto') {
      payment.status = 'void';
      return;
    }
    st.payments = st.payments.filter((p) => p.id !== paymentId);
    const sub = this.sub(payment.subscriptionId);
    const latest = st.payments.filter((p) => p.subscriptionId === sub.id).reduce<string | null>((m, p) => (m === null || p.dueDate > m ? p.dueDate : m), null);
    if (payment.dueDate < sub.nextDue && (latest === null || latest < payment.dueDate)) {
      sub.nextDue = payment.dueDate;
      sub.updatedAt = this.stamp();
    }
  }

  private updatePayment(id: number, patch: unknown): PaymentRow {
    const v = PaymentPatch.parse(patch ?? {});
    const p = this.load().payments.find((x) => x.id === id);
    if (!p) throw notFound();
    if (v.amountMinor !== undefined) p.amountMinor = v.amountMinor;
    if (v.actualBaseMinor !== undefined) p.actualBaseMinor = v.actualBaseMinor;
    if (v.status !== undefined) p.status = v.status;
    return p;
  }

  private listPayments(f: PaymentQuery): PaymentRow[] {
    return this.load()
      .payments.filter(
        (p) =>
          (f.subscriptionId === undefined || p.subscriptionId === f.subscriptionId) &&
          (f.from === undefined || p.dueDate >= f.from) &&
          (f.to === undefined || p.dueDate <= f.to) &&
          (f.source === undefined || p.source === f.source) &&
          (f.status === undefined || p.status === f.status),
      )
      .sort((x, y) => y.dueDate.localeCompare(x.dueDate) || y.id - x.id);
  }

  /** Brand logos bundled with the demo that match the name or domain; no outside fetches. */
  private candidates(q: string, domain: string) {
    const index = this.logos ?? { domains: {}, brands: [] };
    const out: { id: string; kind: 'brand' | 'site'; label: string; previewUrl: string; size: number | null; hex?: string }[] = [];
    const file = domain ? index.domains[domain] : undefined;
    const keys = [domain ? norm(domain.split('.').filter((l) => l !== 'www').slice(-2, -1)[0] ?? domain) : '', norm(q)].filter((k) => k.length >= 2);
    for (const brand of index.brands) {
      const title = norm(brand.title);
      const hit = file === `${brand.slug}.svg` || keys.some((k) => brand.slug === k || title === k || title.startsWith(k) || brand.slug.startsWith(k));
      if (hit && out.length < 12) out.push({ id: `brand:${brand.slug}`, kind: 'brand', label: brand.title, previewUrl: `${this.base}logos/${brand.slug}.svg`, size: null, hex: `#${brand.hex}` });
    }
    if (file && !file.endsWith('.svg')) out.push({ id: `file:${file}`, kind: 'site', label: domain, previewUrl: `${this.base}logos/${file}`, size: 128 });
    return out;
  }

  private selectLogo(id: number, body: unknown): SubscriptionRow {
    const s = this.sub(id);
    const { candidateId, style } = (body ?? {}) as { candidateId?: string; style?: string };
    if (candidateId?.startsWith('brand:')) s.logoPath = `${candidateId.slice(6)}${style === 'plain' ? '-plain' : ''}.svg`;
    else if (candidateId?.startsWith('file:')) s.logoPath = candidateId.slice(5);
    else throw new ApiError(400, 'unknown_candidate');
    s.updatedAt = this.stamp();
    return s;
  }
}
