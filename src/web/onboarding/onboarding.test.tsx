import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { guessCurrency, zoneOffset } from '../components/pickers/data';
import { setLocale } from '../i18n';
import { Login } from '../routes/Login';
import { Setup } from '../routes/Setup';
import { mockApi, renderApp } from '../test/render';
import { passwordStrength } from './PasswordField';

beforeEach(() => setLocale('en'));
afterEach(() => vi.unstubAllGlobals());

describe('passwordStrength', () => {
  it('rates by length first, then variety', () => {
    expect(passwordStrength('', 10)).toBe(0);
    expect(passwordStrength('short', 10)).toBe(1);
    expect(passwordStrength('abcdefghij', 10)).toBe(2);
    expect(passwordStrength('Abcdefgh1!', 10)).toBe(3);
    expect(passwordStrength('correct horse battery staple', 10)).toBe(4);
  });
});

describe('locale helpers', () => {
  it('guesses the currency from the browser region', () => {
    expect(guessCurrency(['tr-TR'])).toBe('TRY');
    expect(guessCurrency(['de-DE'])).toBe('EUR');
    expect(guessCurrency(['en-GB', 'en'])).toBe('GBP');
    expect(guessCurrency(['en'])).toBe('USD');
    expect(guessCurrency(['ja-JP'])).toBe('JPY');
    expect(guessCurrency(['ko-KR'])).toBe('KRW');
  });

  it('formats a zone offset', () => {
    expect(zoneOffset('Europe/Istanbul', new Date('2026-07-01T00:00:00Z'))).toEqual({ label: 'GMT+3', minutes: 180 });
    expect(zoneOffset('UTC').minutes).toBe(0);
  });
});

describe('Setup', () => {
  it('blocks a mismatched confirmation, then creates the account in the current language', async () => {
    setLocale('tr');
    const calls = mockApi({ 'POST /api/auth/setup': { id: 1 }, 'PATCH /api/settings': {} });
    const onDone = vi.fn();
    renderApp(<Setup onDone={onDone} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Kullanıcı adı'), 'deniz');
    await user.type(screen.getByLabelText('Parola'), 'correct horse battery');
    await user.type(screen.getByLabelText('Parolayı tekrar gir'), 'correct horse');
    await user.click(screen.getByRole('button', { name: 'Hesap oluştur' }));
    expect(await screen.findByText('Parolalar aynı değil.')).toBeInTheDocument();
    expect(calls).toHaveLength(0);

    await user.type(screen.getByLabelText('Parolayı tekrar gir'), ' battery');
    await user.click(screen.getByRole('button', { name: 'Hesap oluştur' }));
    await vi.waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(calls.map((c) => [c.method, c.url, c.body])).toEqual([
      ['POST', '/api/auth/setup', { username: 'deniz', password: 'correct horse battery' }],
      ['PATCH', '/api/settings', { locale: 'tr' }],
    ]);
  });

  it('uses new-password autocomplete and shows the strength meter text', async () => {
    renderApp(<Setup onDone={() => {}} />);
    const pw = screen.getByLabelText('Password');
    expect(pw).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByLabelText('Username')).toHaveAttribute('autocomplete', 'username');
    await userEvent.setup().type(pw, 'abc');
    expect(screen.getByText('Too short. Use at least 10 characters.')).toBeInTheDocument();
  });
});

describe('Login', () => {
  it('toggles password visibility and warns about Caps Lock', async () => {
    renderApp(<Login />);
    const pw = screen.getByLabelText('Password');
    expect(pw).toHaveAttribute('type', 'password');
    expect(pw).toHaveAttribute('autocomplete', 'current-password');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Show password' }));
    expect(pw).toHaveAttribute('type', 'text');
    fireEvent.keyDown(pw, { key: 'A', modifierCapsLock: true });
    expect(screen.getByText('Caps Lock is on')).toBeInTheDocument();
  });

  it('shows a styled error on wrong credentials', async () => {
    mockApi({ 'POST /api/auth/login': new Response(JSON.stringify({ error: 'invalid' }), { status: 401 }) });
    renderApp(<Login />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Username'), 'deniz');
    await user.type(screen.getByLabelText('Password'), 'nope-nope-nope');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong username or password.');
  });
});
