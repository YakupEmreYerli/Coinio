import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../i18n';
import { mockApi, renderApp } from '../test/render';
import { Login, safeNext } from './Login';

vi.mock('@simplewebauthn/browser', () => ({
  browserSupportsWebAuthn: vi.fn(() => true),
  browserSupportsWebAuthnAutofill: vi.fn(async () => false),
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
}));

beforeEach(() => setLocale('en'));
afterEach(() => vi.unstubAllGlobals());

describe('safeNext', () => {
  it('keeps same-site paths', () => {
    expect(safeNext('/oauth/consent?req=abc')).toBe('/oauth/consent?req=abc');
    expect(safeNext('/settings')).toBe('/settings');
  });

  it('refuses anything a browser could turn into another site', () => {
    for (const raw of ['//evil.com', '/\\evil.com', '/\t/evil.com', '/\n/evil.com', 'https://evil.com', null]) expect(safeNext(raw)).toBe('/');
  });
});

describe('Login passkey button', () => {
  it('renders passkey button when server supports WebAuthn and hides it otherwise', async () => {
    mockApi({ 'GET /api/auth/passkey/status': { supported: true } });
    const first = renderApp(<Login />);
    expect(await screen.findByRole('button', { name: /sign in with a passkey/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/username/i)).toHaveAttribute('autocomplete', 'username webauthn');
    first.unmount();

    mockApi({ 'GET /api/auth/passkey/status': { supported: false } });
    renderApp(<Login />);
    await vi.waitFor(() => {
      expect(screen.queryByRole('button', { name: /sign in with a passkey/i })).not.toBeInTheDocument();
    });
  });
});
