import { act, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../i18n';
import { renderApp } from '../test/render';
import { AuthLayout } from './AuthLayout';

afterEach(async () => {
  await act(() => setLocale('en'));
});

/** The preview card's text: names and amounts. */
const card = () => screen.getByText(/Netflix/).closest('div[aria-hidden]')!.textContent ?? '';

describe('sign-in preview card', () => {
  it('follows the chosen language, not the browser region', async () => {
    renderApp(<AuthLayout>form</AuthLayout>);
    expect(card()).toContain('$');
    await act(() => setLocale('ja'));
    expect(card()).toMatch(/[¥￥]/);
    await act(() => setLocale('de'));
    expect(card()).toContain('€');
    await act(() => setLocale('tr'));
    expect(card()).toContain('₺');
  });
});
