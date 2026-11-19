import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_APPEARANCE } from '../../../shared/appearance';
import { setLocale } from '../../i18n';
import { mockApi, renderApp, sub } from '../../test/render';
import { AppearanceRoot } from '../../lib/AppearanceRoot';
import { Appearance } from './Appearance';

const settings = { baseCurrency: 'TRY', timezone: 'Europe/Istanbul', locale: 'tr', reminderTime: '09:00', telegramBotToken: null, telegramChatId: null };

function setup(appearance = DEFAULT_APPEARANCE) {
  let stored = appearance;
  const calls = mockApi({
    'GET /api/settings': settings,
    'GET /api/subscriptions': [sub({ category: 'Eğlence' })],
    'GET /api/appearance': () => stored,
    'PUT /api/appearance': (init: { body?: unknown }) => (stored = JSON.parse(String(init.body))),
  });
  renderApp(
    <AppearanceRoot>
      <Appearance />
    </AppearanceRoot>,
  );
  const puts = () => calls.filter((c) => c.method === 'PUT').map((c) => c.body as typeof DEFAULT_APPEARANCE);
  return { calls, puts };
}

beforeEach(() => setLocale('tr'));
afterEach(() => {
  vi.unstubAllGlobals();
  document.getElementById('st-custom-css')?.remove();
});

describe('appearance settings', () => {
  it('changing theme applies immediately and saves', async () => {
    const { puts } = setup();
    await userEvent.setup().click(await screen.findByRole('radio', { name: /^gece/i }));
    expect(document.documentElement.dataset.theme).toBe('night');
    await vi.waitFor(() => expect(puts().at(-1)?.theme).toBe('night'), { timeout: 2000 });
  });

  it('reset section restores defaults', async () => {
    const { puts } = setup({ ...DEFAULT_APPEARANCE, accent: '#ea6a12', theme: 'night' });
    const section = (await screen.findByRole('heading', { name: /^tema$/i })).closest('section')!;
    await userEvent.setup().click(within(section).getByRole('button', { name: /varsayılana dön/i }));
    await vi.waitFor(() => expect(puts().at(-1)).toMatchObject({ theme: 'paper', accent: '#ea6a12' }), { timeout: 2000 });
  });

  it('card layout reorder by keyboard saves new order', async () => {
    const { puts } = setup();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /karşılama: aşağı taşı/i }));
    await vi.waitFor(() => expect(puts().at(-1)?.cards.slice(0, 2).map((c) => c.id)).toEqual(['month', 'greeting']), { timeout: 2000 });
    await user.click(screen.getByRole('switch', { name: /özet/i }));
    await vi.waitFor(() => expect(puts().at(-1)?.cards.find((c) => c.id === 'stats')?.visible).toBe(false), { timeout: 2000 });
  });

  it('import invalid theme json shows error and keeps current', async () => {
    const { puts } = setup();
    const user = userEvent.setup();
    await user.upload(await screen.findByLabelText(/tema dosyası yükle/i), new File(['{bad json'], 'theme.json', { type: 'application/json' }));
    expect(await screen.findByText(/okunamadı/i)).toBeInTheDocument();
    expect(puts()).toHaveLength(0);
  });

  it('importing a theme asks first, and warns when it brings CSS or HTML', async () => {
    const { puts } = setup();
    const user = userEvent.setup();
    const theme = { ...DEFAULT_APPEARANCE, theme: 'night', customCss: 'body{color:red}', htmlCards: [{ id: 'w', title: 'Weather', html: '<script>1</script>', height: 120 }] };
    await user.upload(await screen.findByLabelText(/tema dosyası yükle/i), new File([JSON.stringify(theme)], 'theme.json', { type: 'application/json' }));
    const dialog = await screen.findByRole('dialog', { name: /tema yüklensin mi/i });
    expect(within(dialog).getByText(/1 HTML kartı var/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /vazgeç|iptal/i }));
    await new Promise((r) => setTimeout(r, 800));
    expect(puts()).toHaveLength(0);

    await user.upload(screen.getByLabelText(/tema dosyası yükle/i), new File([JSON.stringify(theme)], 'theme.json', { type: 'application/json' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /^tema yükle$/i }));
    await vi.waitFor(() => expect(puts().at(-1)).toMatchObject({ theme: 'night', customCss: 'body{color:red}' }), { timeout: 2000 });
  });

  it('custom css textarea updates style tag', async () => {
    setup();
    const user = userEvent.setup();
    const box = await screen.findByRole('textbox', { name: /özel css/i });
    await user.type(box, '.x{{color:red}');
    expect(document.getElementById('st-custom-css')?.textContent).toBe('.x{color:red}');
  });
});
