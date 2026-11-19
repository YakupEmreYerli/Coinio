import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { setLocale } from '../i18n';
import { Money } from './Money';

beforeEach(() => setLocale('tr'));

describe('Money', () => {
  it('Money renders ₺1.234,56 with superscript cents in tr', () => {
    const { container } = render(<Money minor={123456} currency="TRY" />);
    expect(container.textContent).toBe('₺1.234,56');
    expect(container.querySelector('[data-cents]')?.textContent).toBe(',56');
  });

  it('Money keeps big amounts on one line', () => {
    const { container } = render(<Money minor={123456789} currency="TRY" />);
    expect(container.textContent).toBe('₺1.234.567,89');
    expect(container.firstElementChild?.className).toContain('whitespace-nowrap');
  });

  it('Money approx prefix', () => {
    const { container } = render(<Money minor={86800} currency="TRY" approx />);
    expect(container.textContent).toBe('≈ ₺868,00');
  });

  it('Money hidden and inline cents', () => {
    expect(render(<Money minor={123456} currency="TRY" cents="hidden" />).container.textContent).toBe('₺1.234');
    const inline = render(<Money minor={123456} currency="TRY" cents="inline" />).container;
    expect(inline.textContent).toBe('₺1.234,56');
    expect(inline.querySelector('[data-cents]')).toBeNull();
  });

  it('formats other currencies in their own symbol', () => {
    setLocale('en');
    expect(render(<Money minor={2000} currency="USD" cents="inline" />).container.textContent).toBe('$20.00');
  });

  it('big sizes scale with their container instead of overflowing', () => {
    const hero = render(<Money minor={123456789} currency="TRY" size="hero" />).container.firstElementChild!;
    const xl = render(<Money minor={123456789} currency="TRY" size="xl" />).container.firstElementChild!;
    expect(hero.className).toMatch(/cqw/);
    expect(xl.className).toMatch(/cqw/);
  });
});
