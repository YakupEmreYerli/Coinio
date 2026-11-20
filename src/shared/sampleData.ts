import type { CategoryKey } from './catalog';
import type { Locale } from './locales';

/** Demo subscriptions for "try with sample data"; next payment is `dueIn` days from today. */
export const SAMPLE_SUBSCRIPTIONS = [
  { name: 'Netflix', domain: 'netflix.com', amountMinor: 1549, currency: 'USD', cycle: 'monthly', category: 'streaming', paymentMethod: 'Card', dueIn: 3, autoPay: true },
  { name: 'Spotify', domain: 'spotify.com', amountMinor: 1199, currency: 'USD', cycle: 'monthly', category: 'music', paymentMethod: 'Card', dueIn: 9, autoPay: true },
  { name: 'iCloud+', domain: 'icloud.com', amountMinor: 299, currency: 'USD', cycle: 'monthly', category: 'cloud', paymentMethod: 'Card', dueIn: 14, autoPay: true },
  { name: 'ChatGPT Plus', domain: 'chatgpt.com', amountMinor: 2000, currency: 'USD', cycle: 'monthly', category: 'ai', paymentMethod: 'Card', dueIn: 5, autoPay: true },
  { name: 'GitHub Copilot', domain: 'github.com', amountMinor: 10000, currency: 'USD', cycle: 'yearly', category: 'devtools', paymentMethod: 'Card', dueIn: 41, autoPay: true },
  { name: 'Home internet', domain: null, amountMinor: 4500, currency: 'USD', cycle: 'monthly', category: 'telecom', paymentMethod: 'Bank transfer', dueIn: -2, autoPay: false },
  { name: 'Gym', domain: null, amountMinor: 3900, currency: 'USD', cycle: 'monthly', category: 'health', paymentMethod: 'Cash', dueIn: 12, autoPay: false },
  { name: 'Domain renewal', domain: 'namecheap.com', amountMinor: 1398, currency: 'USD', cycle: 'yearly', category: 'devtools', paymentMethod: 'Card', dueIn: 120, autoPay: true },
] as const;

type SampleSub = { name: string; domain: string | null; amountMinor: number; currency: string; cycle: 'monthly' | 'yearly'; category: CategoryKey; paymentMethod: string; dueIn: number; autoPay: boolean };

/** Turkish visitors see lira prices and services they know; ChatGPT stays in dollars to show conversion. */
const SAMPLES_TR: readonly SampleSub[] = [
  { name: 'Netflix', domain: 'netflix.com', amountMinor: 34999, currency: 'TRY', cycle: 'monthly', category: 'streaming', paymentMethod: 'Card', dueIn: 3, autoPay: true },
  { name: 'Spotify', domain: 'spotify.com', amountMinor: 12999, currency: 'TRY', cycle: 'monthly', category: 'music', paymentMethod: 'Card', dueIn: 9, autoPay: true },
  { name: 'YouTube Premium', domain: 'youtube.com', amountMinor: 10999, currency: 'TRY', cycle: 'monthly', category: 'streaming', paymentMethod: 'Card', dueIn: 17, autoPay: true },
  { name: 'iCloud+', domain: 'icloud.com', amountMinor: 5999, currency: 'TRY', cycle: 'monthly', category: 'cloud', paymentMethod: 'Card', dueIn: 14, autoPay: true },
  { name: 'ChatGPT Plus', domain: 'chatgpt.com', amountMinor: 2000, currency: 'USD', cycle: 'monthly', category: 'ai', paymentMethod: 'Card', dueIn: 5, autoPay: true },
  { name: 'Home internet', domain: null, amountMinor: 79900, currency: 'TRY', cycle: 'monthly', category: 'telecom', paymentMethod: 'Bank transfer', dueIn: -2, autoPay: false },
  { name: 'Gym', domain: null, amountMinor: 150000, currency: 'TRY', cycle: 'monthly', category: 'health', paymentMethod: 'Cash', dueIn: 12, autoPay: false },
  { name: 'Domain renewal', domain: 'namecheap.com', amountMinor: 49900, currency: 'TRY', cycle: 'yearly', category: 'devtools', paymentMethod: 'Card', dueIn: 120, autoPay: true },
];

/** The demo's main currency per language (no yen: amounts are stored in hundredths). */
export const SAMPLE_CURRENCY: Record<Locale, string> = { en: 'USD', tr: 'TRY', de: 'EUR', fr: 'EUR', es: 'EUR', 'pt-BR': 'BRL', 'zh-CN': 'CNY', ja: 'USD' };

/** Sample names and payment methods that are words rather than brands, per language. */
const SAMPLE_WORDS: Record<Locale, Record<string, string>> = {
  en: {},
  tr: { 'Home internet': 'Ev interneti', Gym: 'Spor salonu', 'Domain renewal': 'Alan adı yenileme', Card: 'Kart', 'Bank transfer': 'Havale', Cash: 'Nakit' },
  de: { 'Home internet': 'Internet zu Hause', Gym: 'Fitnessstudio', 'Domain renewal': 'Domain-Verlängerung', Card: 'Karte', 'Bank transfer': 'Überweisung', Cash: 'Bar' },
  fr: { 'Home internet': 'Box internet', Gym: 'Salle de sport', 'Domain renewal': 'Renouvellement du domaine', Card: 'Carte', 'Bank transfer': 'Virement', Cash: 'Espèces' },
  es: { 'Home internet': 'Internet de casa', Gym: 'Gimnasio', 'Domain renewal': 'Renovación del dominio', Card: 'Tarjeta', 'Bank transfer': 'Transferencia', Cash: 'Efectivo' },
  'pt-BR': { 'Home internet': 'Internet de casa', Gym: 'Academia', 'Domain renewal': 'Renovação do domínio', Card: 'Cartão', 'Bank transfer': 'Transferência', Cash: 'Dinheiro' },
  'zh-CN': { 'Home internet': '家庭宽带', Gym: '健身房', 'Domain renewal': '域名续费', Card: '银行卡', 'Bank transfer': '银行转账', Cash: '现金' },
  ja: { 'Home internet': '自宅のネット回線', Gym: 'ジム', 'Domain renewal': 'ドメイン更新', Card: 'カード', 'Bank transfer': '銀行振込', Cash: '現金' },
};

/** A sample's name or payment method in `locale`; brand names stay as they are. */
export const sampleWord = (word: string, locale: Locale): string => SAMPLE_WORDS[locale][word] ?? word;

/** Rough USD rates, only to price the samples in the user's own currency (rounded to a "real" price). */
export const SAMPLE_RATES: Record<string, number> = { USD: 1, EUR: 0.93, GBP: 0.79, CHF: 0.88, CAD: 1.38, AUD: 1.52, TRY: 43, BRL: 5.6, MXN: 18, CNY: 7.2, SEK: 10.5, NOK: 10.8, DKK: 6.9, PLN: 4, CZK: 23 };

/** Converts a sample USD price to `currency`, ending in .99 like a shop price; unknown currencies stay in USD. */
export function samplePrice(usdMinor: number, currency: string): { amountMinor: number; currency: string } {
  const rate = SAMPLE_RATES[currency];
  if (!rate) return { amountMinor: usdMinor, currency: 'USD' };
  const whole = Math.max(1, Math.round((usdMinor / 100) * rate));
  return { amountMinor: whole * 100 - 1, currency };
}

/**
 * The sample set priced for `baseCurrency`: Turkish prices in lira, elsewhere converted from USD.
 * `foreignExample` leaves ChatGPT in USD to show conversion; only where rates are known up front (the demo).
 */
export function samplesFor(locale: Locale, baseCurrency: string, { foreignExample = false } = {}): SampleSub[] {
  const usdOk = foreignExample || baseCurrency === 'USD';
  if (locale === 'tr' && baseCurrency === 'TRY') {
    return SAMPLES_TR.map((s) => (s.currency === 'USD' && !usdOk ? { ...s, ...samplePrice(s.amountMinor, 'TRY') } : { ...s }));
  }
  if (baseCurrency === 'USD') return SAMPLE_SUBSCRIPTIONS.map((s) => ({ ...s }));
  return SAMPLE_SUBSCRIPTIONS.map((s) => {
    const keepUsd = usdOk && s.name === 'ChatGPT Plus' && SAMPLE_RATES[baseCurrency] !== undefined;
    return { ...s, ...(keepUsd ? {} : samplePrice(s.amountMinor, baseCurrency)) };
  });
}
