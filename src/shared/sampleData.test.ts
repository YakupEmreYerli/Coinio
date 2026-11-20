import { describe, expect, it } from 'vitest';
import { SAMPLE_CURRENCY, samplePrice, samplesFor } from './sampleData';

describe('samplePrice', () => {
  it('ends two-decimal prices in .99', () => {
    expect(samplePrice(1549, 'EUR')).toEqual({ amountMinor: 1399, currency: 'EUR' });
  });

  it('prices yen and won as whole shop prices', () => {
    // 15.49 USD × 155 ≈ ¥2,401 → ¥2,390; 2.99 USD ≈ ¥463 → ¥490.
    expect(samplePrice(1549, 'JPY')).toEqual({ amountMinor: 2390, currency: 'JPY' });
    expect(samplePrice(299, 'JPY')).toEqual({ amountMinor: 490, currency: 'JPY' });
    // 15.49 USD × 1400 ≈ ₩21,686 → ₩21,900.
    expect(samplePrice(1549, 'KRW')).toEqual({ amountMinor: 21900, currency: 'KRW' });
  });
});

describe('samplesFor', () => {
  it('uses yen for Japanese, keeping ChatGPT in dollars only when asked', () => {
    expect(SAMPLE_CURRENCY.ja).toBe('JPY');
    const demo = samplesFor('ja', 'JPY', { foreignExample: true });
    expect(demo.find((s) => s.name === 'Netflix')).toMatchObject({ currency: 'JPY', amountMinor: 2390 });
    expect(demo.find((s) => s.name === 'ChatGPT Plus')).toMatchObject({ currency: 'USD', amountMinor: 2000 });
    expect(samplesFor('ja', 'JPY').every((s) => s.currency === 'JPY' && s.amountMinor % 10 === 0)).toBe(true);
  });
});
