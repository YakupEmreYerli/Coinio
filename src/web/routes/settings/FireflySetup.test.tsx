import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../../i18n';
import { mockApi, renderApp } from '../../test/render';
import { FireflySetup } from './FireflySetup';

beforeEach(() => setLocale('en'));
afterEach(() => vi.unstubAllGlobals());

const accounts = [{ id: '1', name: 'Checking', currencyCode: 'EUR' }];
const conn = (over: Record<string, unknown> = {}) => ({
  baseUrl: 'https://ff.example.com', hasToken: true, assetAccountId: '1', enabled: true, initialSyncDone: true,
  lastSyncAt: null, lastError: null, excluded: { subscriptions: [], bills: [] }, ...over,
});
const preview = {
  matched: [{ subscriptionId: 1, billId: '10', name: 'Netflix' }],
  toFirefly: [{ subscriptionId: 2, name: 'Spotify' }],
  toCoinio: [{ billId: '11', name: 'Rent' }],
};
const result = { created: { coinio: 1, firefly: 1 }, updated: { coinio: 1, firefly: 0 }, deactivated: { coinio: 0, firefly: 0 }, paymentsIn: 2, paymentsOut: 1 };
const firefly = (code: string) => () => new Response(JSON.stringify({ error: 'firefly', message: code }), { status: 502 });

describe('Firefly III settings', () => {
  it('shows the connect form when not connected', async () => {
    mockApi({ 'GET /api/firefly': { connection: null }, 'PUT /api/firefly': firefly('unauthorized') });
    renderApp(<FireflySetup />);
    const user = userEvent.setup();
    const token = await screen.findByLabelText('Personal access token');
    expect(token).toHaveAttribute('type', 'password');
    expect(token).toHaveAttribute('autocomplete', 'off');
    await user.type(screen.getByLabelText('Firefly III address'), 'https://ff.example.com');
    await user.type(token, 'bad');
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    expect(await screen.findByText("Firefly III didn't accept this token. Create a new one and paste it here.")).toBeInTheDocument();
  });

  it('shows the preview with checkboxes after connecting', async () => {
    let connection: unknown = null;
    const calls = mockApi({
      'GET /api/firefly': () => ({ connection }),
      'PUT /api/firefly': () => {
        connection = conn({ assetAccountId: null, initialSyncDone: false });
        return { version: '6.1.0', accounts };
      },
      'GET /api/firefly/accounts': { accounts },
      'GET /api/firefly/preview': preview,
    });
    renderApp(<FireflySetup />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Firefly III address'), 'https://ff.example.com');
    await user.type(screen.getByLabelText('Personal access token'), 'tok');
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    expect(await screen.findByRole('checkbox', { name: 'Netflix' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Spotify' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Rent' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Start syncing' })).toBeDisabled();
    expect(calls).toContainEqual(expect.objectContaining({ method: 'PUT', url: '/api/firefly', body: { baseUrl: 'https://ff.example.com', token: 'tok' } }));
  });

  it('unchecking a matched row sends it in unmatch', async () => {
    const calls = mockApi({
      'GET /api/firefly': { connection: conn({ initialSyncDone: false }) },
      'GET /api/firefly/accounts': { accounts },
      'GET /api/firefly/preview': preview,
      'POST /api/firefly/initial': result,
    });
    renderApp(<FireflySetup />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('checkbox', { name: 'Netflix' }));
    await user.click(screen.getByRole('checkbox', { name: 'Rent' }));
    await user.click(screen.getByRole('button', { name: 'Start syncing' }));
    await vi.waitFor(() =>
      expect(calls).toContainEqual(expect.objectContaining({ method: 'POST', url: '/api/firefly/initial', body: { unmatch: [1], exclude: { subscriptions: [], bills: ['11'] } } })),
    );
  });

  it('sync now shows the result', async () => {
    const calls = mockApi({
      'GET /api/firefly': { connection: conn({ lastSyncAt: '2026-11-20T10:00:00Z' }) },
      'GET /api/firefly/accounts': { accounts },
      'POST /api/firefly/sync': result,
    });
    renderApp(<FireflySetup />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Sync now' }));
    expect(await screen.findByText('Synced. Changes: 4 in Coinio, 2 in Firefly III.')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST' && c.url === '/api/firefly/sync')).toBe(true);
  });

  it('asks for a new token after Firefly rejected the old one', async () => {
    const calls = mockApi({
      'GET /api/firefly': { connection: conn({ enabled: false, lastError: 'unauthorized' }) },
      'GET /api/firefly/accounts': firefly('unauthorized'),
      'PUT /api/firefly': { version: '6.1.0', accounts },
    });
    renderApp(<FireflySetup />);
    const user = userEvent.setup();
    expect(await screen.findByRole('alert')).toHaveTextContent('Firefly III no longer accepts your token');
    expect(screen.getByRole('button', { name: 'Sync now' })).toBeDisabled();
    await user.type(screen.getByLabelText('New token'), 'fresh');
    await user.click(screen.getByRole('button', { name: 'Save token' }));
    await vi.waitFor(() =>
      expect(calls).toContainEqual(expect.objectContaining({ method: 'PUT', url: '/api/firefly', body: { baseUrl: 'https://ff.example.com', token: 'fresh' } })),
    );
  });

  it('brings an excluded subscription back', async () => {
    const calls = mockApi({
      'GET /api/firefly': { connection: conn({ excluded: { subscriptions: [2], bills: ['11'] }, excludedBills: [{ id: '11', name: 'Rent' }] }) },
      'GET /api/firefly/accounts': { accounts },
      'GET /api/subscriptions': [{ id: 2, name: 'Spotify' }],
    });
    renderApp(<FireflySetup />);
    const user = userEvent.setup();
    const list = await screen.findByRole('list', { name: 'Left out of syncing' });
    expect(within(list).getByText('Rent')).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: 'Rent: include again' })).toBeInTheDocument();
    await user.click(await within(list).findByRole('button', { name: 'Spotify: include again' }));
    await vi.waitFor(() =>
      expect(calls).toContainEqual(expect.objectContaining({ method: 'PATCH', url: '/api/firefly', body: { excluded: { subscriptions: [], bills: ['11'] } } })),
    );
  });

  it('shows a hint when Firefly has no asset accounts', async () => {
    mockApi({
      'GET /api/firefly': { connection: conn({ assetAccountId: null, initialSyncDone: false }) },
      'GET /api/firefly/accounts': { accounts: [] },
      'GET /api/firefly/preview': preview,
    });
    renderApp(<FireflySetup />);
    expect(await screen.findByText('Firefly III has no asset accounts yet. Add one there, then come back.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start syncing' })).toBeDisabled();
  });

  it('disconnect asks for confirmation', async () => {
    let connection: unknown = conn();
    const calls = mockApi({
      'GET /api/firefly': () => ({ connection }),
      'GET /api/firefly/accounts': { accounts },
      'DELETE /api/firefly': () => {
        connection = null;
        return new Response(null, { status: 204 });
      },
    });
    renderApp(<FireflySetup />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Disconnect' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Subscriptions and payments stay as they are in Coinio and in Firefly III.');
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    await user.click(within(dialog).getByRole('button', { name: 'Disconnect' }));
    await vi.waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.url === '/api/firefly')).toBe(true));
    expect(await screen.findByLabelText('Firefly III address')).toBeInTheDocument();
  });
});
