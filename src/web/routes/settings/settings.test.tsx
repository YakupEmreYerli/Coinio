import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../../i18n';
import { mockApi, renderApp, setViewport } from '../../test/render';
import { SettingsLayout } from './SettingsLayout';

const settings = { baseCurrency: 'TRY', timezone: 'Europe/Istanbul', locale: 'tr', reminderTime: '09:00', telegramBotToken: null, telegramChatId: null };

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
    await user.click(await screen.findByRole('option', { name: 'USD' }));
    await vi.waitFor(() => expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ baseCurrency: 'USD' }));
  });

  it('telegram test shows result toast', async () => {
    mockApi({ 'GET /api/settings': { ...settings, telegramBotToken: '****9999', telegramChatId: '42' }, 'POST /api/settings/telegram/test': { ok: true } });
    open('notifications');
    await userEvent.setup().click(await screen.findByRole('button', { name: /test mesajı gönder/i }));
    expect(await screen.findByText(/test mesajı gönderildi/i)).toBeInTheDocument();
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
