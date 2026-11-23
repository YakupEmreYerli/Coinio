import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../../i18n';
import { mockApi, renderApp } from '../../test/render';
import { PasskeysSection } from './PasskeysSection';

vi.mock('@simplewebauthn/browser', () => ({
  browserSupportsWebAuthn: vi.fn(() => true),
  browserSupportsWebAuthnAutofill: vi.fn(async () => false),
  startRegistration: vi.fn(async () => ({
    id: 'cred-new',
    rawId: 'cred-new',
    type: 'public-key',
    clientExtensionResults: {},
    response: { clientDataJSON: 'x', attestationObject: 'y', transports: ['internal'] },
  })),
  startAuthentication: vi.fn(),
}));

beforeEach(() => setLocale('en'));
afterEach(() => vi.unstubAllGlobals());

describe('PasskeysSection', () => {
  it('shows HTTPS notice when server says passkeys are unsupported', async () => {
    mockApi({ 'GET /api/auth/passkeys': { supported: false, passkeys: [] } });
    renderApp(<PasskeysSection />);
    expect(await screen.findByText(/require HTTPS/i)).toBeInTheDocument();
  });

  it('lists, adds, renames and removes passkeys', async () => {
    const row = {
      id: 'cred-1',
      name: 'MacBook Touch ID',
      deviceType: 'multiDevice',
      backedUp: true,
      createdAt: '2026-11-23T10:00:00Z',
      lastUsedAt: null,
    };
    const calls = mockApi({
      'GET /api/auth/passkeys': { supported: true, passkeys: [row] },
      'POST /api/auth/passkey/register/options': { challengeToken: 'tok', options: { challenge: 'ch' } },
      'POST /api/auth/passkey/register/verify': { ...row, id: 'cred-new', name: 'Work Key' },
      'PATCH /api/auth/passkey/cred-1': { ...row, name: 'Personal Mac' },
      'DELETE /api/auth/passkey/cred-1': new Response(null, { status: 204 }),
    });
    const onChanged = vi.fn();
    renderApp(<PasskeysSection onChanged={onChanged} />);

    expect(await screen.findByText('MacBook Touch ID')).toBeInTheDocument();
    expect(screen.getByText('Synced')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(/MacBook Touch ID/i), 'Work Key');
    await user.click(screen.getByRole('button', { name: /add passkey/i }));
    await vi.waitFor(() => expect(calls.some((c) => c.url === '/api/auth/passkey/register/verify')).toBe(true));

    await user.click(screen.getByRole('button', { name: /rename passkey/i }));
    const renameInput = screen.getByLabelText(/rename passkey/i);
    await user.clear(renameInput);
    await user.type(renameInput, 'Personal Mac{Enter}');
    await vi.waitFor(() => expect(calls.some((c) => c.method === 'PATCH' && c.url === '/api/auth/passkey/cred-1')).toBe(true));

    await user.click(screen.getByRole('button', { name: /remove passkey/i }));
    await vi.waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.url === '/api/auth/passkey/cred-1')).toBe(true));
    expect(onChanged).toHaveBeenCalled();
  });
});
