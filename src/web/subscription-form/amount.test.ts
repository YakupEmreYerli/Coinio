import { describe, expect, it } from 'vitest';
import { formatAmountInput, parseAmount } from './amount';

describe('amount input', () => {
  it('parseAmount handles tr and en formats', () => {
    expect(parseAmount('99,99', 'tr', 'EUR')).toBe(9999);
    expect(parseAmount('1.234,50', 'tr', 'EUR')).toBe(123450);
    expect(parseAmount('1234', 'tr', 'EUR')).toBe(123400);
    expect(parseAmount('99.99', 'tr', 'EUR')).toBe(9999);
    expect(parseAmount('1,234.50', 'en', 'EUR')).toBe(123450);
    expect(parseAmount('99.9', 'en', 'EUR')).toBe(9990);
    expect(parseAmount(' ₺ 49,99 ', 'tr', 'EUR')).toBe(4999);
    expect(parseAmount('1.234,50', 'de', 'EUR')).toBe(123450);
    expect(parseAmount('1 234,50', 'fr', 'EUR')).toBe(123450);
    expect(parseAmount('12,90', 'pt-BR', 'EUR')).toBe(1290);
    expect(parseAmount('1,234.50', 'zh-CN', 'EUR')).toBe(123450);
  });

  it('rejects garbage, negatives and more than two decimals', () => {
    for (const bad of ['', 'abc', '1o0', '10a', '1_00', '-5', '1,2,3', '9,999', '1.2.3,4.5']) expect(parseAmount(bad, 'tr', 'EUR'), bad).toBeNull();
  });

  it('formats minor units for editing', () => {
    expect(formatAmountInput(123450, 'tr', 'EUR')).toBe('1234,50');
    expect(formatAmountInput(123450, 'en', 'EUR')).toBe('1234.50');
    expect(formatAmountInput(123450, 'de', 'EUR')).toBe('1234,50');
    expect(formatAmountInput(123450, 'ja', 'EUR')).toBe('1234.50');
    expect(formatAmountInput(5, 'tr', 'EUR')).toBe('0,05');
  });

  it('takes whole numbers only for currencies without decimals', () => {
    expect(parseAmount('1490', 'ja', 'JPY')).toBe(1490);
    expect(parseAmount('1,490', 'ja', 'JPY')).toBe(1490);
    expect(parseAmount('￥1,490', 'ja', 'JPY')).toBe(1490);
    expect(parseAmount('1.490', 'tr', 'JPY')).toBe(1490);
    expect(parseAmount('17,000', 'en', 'KRW')).toBe(17000);
    for (const bad of ['1490.5', '1490.00', '14,90']) expect(parseAmount(bad, 'ja', 'JPY'), bad).toBeNull();
    expect(formatAmountInput(1490, 'ja', 'JPY')).toBe('1490');
    expect(formatAmountInput(1490, 'tr', 'JPY')).toBe('1490');
  });

  it('takes up to three decimals where the currency has them', () => {
    expect(parseAmount('1.250', 'en', 'KWD')).toBe(1250);
    expect(parseAmount('2,5', 'tr', 'KWD')).toBe(2500);
    expect(formatAmountInput(1250, 'en', 'KWD')).toBe('1.250');
  });
});
