import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../../i18n';
import { mockApi, renderApp, setViewport } from '../../test/render';
import { SettingsLayout } from './SettingsLayout';
import { defaultTemplates } from '../../../shared/notify/defaults';
import { DEFAULT_NOTIFY_SETTINGS, NOTIFY_TYPES } from '../../../shared/notify/types';

const telegramChannel = { id: 1, type: 'telegram', name: 'Bot', enabled: true, config: { chatId: '42' }, secrets: { botToken: true }, createdAt: '2026-11-19T00:00:00Z' };

function notificationsPage(channels: unknown[] = []) {
  const defaults = defaultTemplates('tr');
  return {
    settings: DEFAULT_NOTIFY_SETTINGS,
    channels,
    templates: Object.fromEntries(NOTIFY_TYPES.map((t) => [t, { ...defaults[t], custom: false }])),
    defaults,
    appUrl: null,
  };
}

const settings = { baseCurrency: 'TRY', timezone: 'Europe/Istanbul', locale: 'tr', reminderTime: '09:00' };

function open(section: string) {
  return renderApp(
    <Routes>
      <Route path="/settings/:section?" element={<SettingsLayout />} />
    </Routes>,
    { route: `/settings/${section}` },
  );
}

beforeEach(() => {
  setLocale('tr');
  setViewport(1440);
});
afterEach(() => vi.unstubAllGlobals());

describe('settings', () => {
  it('general saves base currency', async () => {
    const calls = mockApi({ 'GET /api/settings': settings, 'PATCH /api/settings': { ...settings, baseCurrency: 'USD' } });
    open('general');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('combobox', { name: /ana para birimi/i }));
    await user.click((await screen.findAllByRole('option', { name: /USD/ }))[0]!);
    await vi.waitFor(() => expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ baseCurrency: 'USD' }));
  });

  it('adds a Telegram channel with a topic ID and shows the exact error of a failed test', async () => {
    const page = notificationsPage();
    const calls = mockApi({
      'GET /api/settings': settings,
      'GET /api/notifications': page,
      'POST /api/notifications/channels/test': () => new Response(JSON.stringify({ error: 'delivery_failed', message: 'HTTP 400: Bad Request: chat not found' }), { status: 502 }),
      'POST /api/notifications/channels': { id: 1 },
    });
    open('notifications');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /^kanal ekle$/i }));
    await user.click(screen.getByRole('button', { name: /telegram/i }));
    await user.type(screen.getByLabelText(/bot token/i), '123:ABC');
    await user.type(screen.getByLabelText(/sohbet kimliği/i), '-100');
    await user.type(screen.getByLabelText(/konu kimliği/i), '7');
    await user.click(screen.getByRole('button', { name: /test gönder/i }));
    expect(await screen.findByText(/chat not found/)).toBeInTheDocument();
    expect(calls.find((c) => c.url === '/api/notifications/channels/test')?.body).toMatchObject({
      type: 'telegram', config: { chatId: '-100', threadId: '7' }, secrets: { botToken: '123:ABC' },
    });
    await user.click(screen.getByRole('button', { name: /^kaydet$/i }));
    await vi.waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.url === '/api/notifications/channels')).toBeTruthy());
  });

  it('never shows a saved secret, only that it is saved', async () => {
    mockApi({ 'GET /api/settings': settings, 'GET /api/notifications': notificationsPage([telegramChannel]) });
    open('notifications');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /bot kanalını düzenle/i }));
    const token = screen.getByLabelText(/bot token/i) as HTMLInputElement;
    expect(token.value).toBe('');
    expect(token.placeholder).toMatch(/kayıtlı/i);
  });

  it('edits default reminder days and saves them', async () => {
    const calls = mockApi({ 'GET /api/settings': settings, 'GET /api/notifications': notificationsPage(), 'PUT /api/notifications/settings': (i: RequestInit) => JSON.parse(i.body as string) });
    open('notifications');
    const user = userEvent.setup();
    const monthly = await screen.findByRole('group', { name: /^aylık$/i });
    await user.click(within(monthly).getByRole('button', { name: /kaldır: 3 gün önce/i }));
    await user.type(within(monthly).getByRole('spinbutton'), '0{Enter}');
    await user.click(screen.getAllByRole('button', { name: /^kaydet$/i })[0]!);
    await vi.waitFor(() => expect((calls.find((c) => c.method === 'PUT')?.body as { offsets: object }).offsets).toEqual({ weekly: [3, 1], monthly: [1, 0], yearly: [30, 7, 1] }));
  });

  it('previews a template with sample data and inserts variables', async () => {
    mockApi({ 'GET /api/settings': settings, 'GET /api/notifications': notificationsPage() });
    open('notifications');
    const user = userEvent.setup();
    const title = await screen.findByLabelText(/başlık ya da konu/i);
    await user.clear(title);
    await user.type(title, 'Öde: ');
    await user.click(screen.getByRole('button', { name: /\{\{name\}\}/ }));
    expect((title as HTMLInputElement).value).toBe('Öde: {{name}}');
    expect(await screen.findByText('Öde: Netflix')).toBeInTheDocument();
  });

  it('new api key shown once then only prefix', async () => {
    let keys: unknown[] = [];
    mockApi({
      'GET /api/settings': settings,
      'GET /api/keys': () => keys,
      'POST /api/keys': () => {
        keys = [{ id: 1, name: 'Widget', prefix: 'coi_read_abcd', scope: 'read', createdAt: '2026-11-19T00:00:00Z', lastUsedAt: null }];
        return { id: 1, name: 'Widget', scope: 'read', prefix: 'coi_read_abcd', key: 'coi_read_abcdSECRETSECRET' };
      },
    });
    open('keys');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/anahtar adı/i), 'Widget');
    await user.click(screen.getByRole('radio', { name: /yalnız okuma/i }));
    await user.click(screen.getByRole('button', { name: /anahtar oluştur/i }));
    expect(await screen.findByText('coi_read_abcdSECRETSECRET')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /tamam/i }));
    expect(screen.queryByText('coi_read_abcdSECRETSECRET')).not.toBeInTheDocument();
    expect(await screen.findByText(/coi_read_abcd/)).toBeInTheDocument();
  });

  it('revoke key asks confirmation', async () => {
    const calls = mockApi({
      'GET /api/settings': settings,
      'GET /api/keys': [{ id: 4, name: 'Claude Code', prefix: 'coi_full_xxxx', scope: 'full', createdAt: '2026-11-19T00:00:00Z', lastUsedAt: null }],
    });
    open('keys');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /claude code: iptal et/i }));
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'İptal et' }));
    await vi.waitFor(() => expect(calls).toContainEqual(expect.objectContaining({ method: 'DELETE', url: '/api/keys/4' })));
  });

  it('import preview lists items then imports', async () => {
    const calls = mockApi({
      'GET /api/settings': settings,
      'POST /api/import/wallos': (init: { body?: unknown }) => {
        const body = JSON.parse(String(init.body));
        return { created: body.dryRun ? 0 : 2, items: [{ name: 'Netflix' }, { name: 'Spotify' }], warnings: ['"Spotify": $ assumed USD'] };
      },
    });
    open('import');
    const user = userEvent.setup();
    const file = new File([JSON.stringify([{ Name: 'Netflix' }])], 'wallos.json', { type: 'application/json' });
    await user.upload(await screen.findByLabelText(/wallos dosyası/i), file);
    expect(await screen.findByText('Spotify')).toBeInTheDocument();
    expect(screen.getByText(/assumed USD/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /2 aboneliği içe aktar/i }));
    await vi.waitFor(() => expect(calls.filter((c) => c.url === '/api/import/wallos').map((c) => (c.body as { dryRun: boolean }).dryRun)).toEqual([true, false]));
    expect((await screen.findAllByText(/2 abonelik içe aktarıldı/i)).length).toBeGreaterThan(0);
  });

  it('password change wrong current shows error', async () => {
    mockApi({ 'GET /api/settings': settings, 'POST /api/auth/password': new Response(JSON.stringify({ error: 'wrong_password' }), { status: 403 }) });
    open('account');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/şu anki parola/i), 'wrong-password');
    await user.type(screen.getByLabelText(/yeni parola/i), 'new-password-123');
    await user.click(screen.getByRole('button', { name: /parolayı değiştir/i }));
    expect(await screen.findByText(/şu anki parola yanlış/i)).toBeInTheDocument();
  });
});

describe('integrations', () => {
  it('old keys/apps/connections links open Integrations, with the key form on Read only', async () => {
    mockApi({ 'GET /api/settings': settings, 'GET /api/keys': [], 'GET /api/oauth/clients': [] });
    open('connections');
    expect(await screen.findByRole('heading', { name: 'Yapay zekâ asistanları (MCP)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Bağlı uygulamalar' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Yalnız okuma' })).toHaveAttribute('data-state', 'checked');
    expect(screen.getByRole('radio', { name: 'Tam yetki' })).toHaveAttribute('data-state', 'unchecked');
    expect(screen.getByRole('link', { name: 'Entegrasyonlar' })).toHaveAttribute('aria-current', 'page');
  });
});
