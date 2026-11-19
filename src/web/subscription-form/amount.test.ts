import { describe, expect, it } from 'vitest';
import { formatAmountInput, parseAmount } from './amount';

describe('amount input', () => {
  it('parseAmount handles tr and en formats', () => {
    expect(parseAmount('99,99', 'tr')).toBe(9999);
    expect(parseAmount('1.234,50', 'tr')).toBe(123450);
    expect(parseAmount('1234', 'tr')).toBe(123400);
    expect(parseAmount('99.99', 'tr')).toBe(9999);
    expect(parseAmount('1,234.50', 'en')).toBe(123450);
    expect(parseAmount('99.9', 'en')).toBe(9990);
    expect(parseAmount(' ₺ 49,99 ', 'tr')).toBe(4999);
  });

  it('rejects garbage, negatives and more than two decimals', () => {
    for (const bad of ['', 'abc', '-5', '1,2,3', '9,999', '1.2.3,4.5']) expect(parseAmount(bad, 'tr'), bad).toBeNull();
  });

  it('formats minor units for editing', () => {
    expect(formatAmountInput(123450, 'tr')).toBe('1234,50');
    expect(formatAmountInput(123450, 'en')).toBe('1234.50');
  });
});
