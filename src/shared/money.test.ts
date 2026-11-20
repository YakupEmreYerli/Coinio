import { describe, expect, it } from 'vitest';
import { convertMinor, decimalToMinor, formatMinor, isSupportedCurrency, minorDigits, minorToDecimal } from './money';

describe('minorDigits', () => {
  it('follows ISO 4217 exponents', () => {
    expect(minorDigits('USD')).toBe(2);
    expect(minorDigits('TRY')).toBe(2);
    expect(minorDigits('JPY')).toBe(0);
    expect(minorDigits('KRW')).toBe(0);
    expect(minorDigits('KWD')).toBe(3);
    expect(minorDigits('BHD')).toBe(3);
  });

  it('matches Intl for every currency in the table', () => {
    const known = Intl.supportedValuesOf('currency');
    for (const code of ['BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF', 'BHD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND']) {
      if (!known.includes(code)) continue;
      expect(new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits, code).toBe(minorDigits(code));
    }
  });

  it('differs from Intl only where CLDR display rounding departs from ISO 4217', () => {
    // CLDR shows these without decimals although ISO 4217 (and so stored amounts) keeps 2 (IQD: 3).
    const cldrDisplayOnly = new Set(['AFN', 'ALL', 'COP', 'HUF', 'IDR', 'IQD', 'IRR', 'KPW', 'LAK', 'LBP', 'MGA', 'MMK', 'PKR', 'RSD', 'SLL', 'SOS', 'SYP', 'TWD', 'YER']);
    for (const code of Intl.supportedValuesOf('currency')) {
      const intl = new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits;
      if (intl !== minorDigits(code)) expect(cldrDisplayOnly.has(code), code).toBe(true);
    }
  });
});

describe('isSupportedCurrency', () => {
  it('accepts known codes including zero-decimal ones and rejects made-up ones', () => {
    expect(isSupportedCurrency('USD')).toBe(true);
    expect(isSupportedCurrency('JPY')).toBe(true);
    expect(isSupportedCurrency('KRW')).toBe(true);
    expect(isSupportedCurrency('ABC')).toBe(false);
    expect(isSupportedCurrency('XXX')).toBe(false);
    expect(isSupportedCurrency('usd')).toBe(false);
  });
});

describe('convertMinor', () => {
  it('scales by both exponents', () => {
    // 1000 yen at 1 JPY = 0.0065 USD is 6.50 USD.
    expect(convertMinor(1000, 'JPY', 'USD', 0.0065)).toBe(650);
    // 20.00 USD at 1 USD = 155 JPY is 3100 yen.
    expect(convertMinor(2000, 'USD', 'JPY', 155)).toBe(3100);
    expect(convertMinor(1549, 'USD', 'TRY', 43)).toBe(66607);
    expect(convertMinor(1000, 'KWD', 'USD', 3.25)).toBe(325);
    expect(convertMinor(1234, 'EUR', 'EUR', 1)).toBe(1234);
  });
});

describe('minorToDecimal / decimalToMinor', () => {
  it('writes plain decimals with the currency exponent', () => {
    expect(minorToDecimal(1500, 'JPY')).toBe('1500');
    expect(minorToDecimal(22999, 'USD')).toBe('229.99');
    expect(minorToDecimal(5, 'USD')).toBe('0.05');
    expect(minorToDecimal(-150, 'EUR')).toBe('-1.50');
    expect(minorToDecimal(1234, 'KWD')).toBe('1.234');
  });

  it('reads decimals, refusing more precision than the currency has', () => {
    expect(decimalToMinor(1500, 'JPY')).toBe(1500);
    expect(decimalToMinor(229.99, 'USD')).toBe(22999);
    expect(decimalToMinor(0.1 + 0.2, 'USD')).toBe(30);
    expect(decimalToMinor(1.5, 'JPY')).toBeNull();
    expect(decimalToMinor(1.999, 'USD')).toBeNull();
  });
});

describe('formatMinor', () => {
  it('formats yen without decimals and dollars with cents', () => {
    expect(formatMinor(1500, 'JPY', 'en')).toBe('¥1,500');
    expect(formatMinor(1500, 'JPY', 'ja')).toBe('￥1,500');
    expect(formatMinor(1549, 'USD', 'en')).toBe('$15.49');
    expect(formatMinor(1234567, 'KRW', 'en')).toBe('₩1,234,567');
  });

  it('keeps the ISO exponent even where CLDR display rounding differs', () => {
    expect(formatMinor(499000, 'HUF', 'en')).toBe('HUF\u00a04,990.00');
  });

  it('passes extra options such as compact notation', () => {
    expect(formatMinor(250000, 'JPY', 'en', { notation: 'compact', maximumFractionDigits: 1 })).toBe('¥250K');
    expect(formatMinor(1549, 'USD', 'en', { maximumFractionDigits: 0 })).toBe('$15');
  });
});
