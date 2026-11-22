import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../../i18n';
import { mockApi, renderApp } from '../../test/render';
import { AndroidSetup, scriptWidgetParameter } from './AndroidSetup';

beforeEach(() => setLocale('en'));

describe('Android widget (ScriptWidget)', () => {
  it('needs only the key on the hosted Coinio, the address too on your own server', () => {
    expect(scriptWidgetParameter('https://app.getcoinio.me', 'coi_read_x')).toBe('coi_read_x');
    expect(scriptWidgetParameter('https://coinio.example.com', 'coi_read_x')).toBe('https://coinio.example.com coi_read_x');
  });

  it('makes a read-only key and offers the parameter to copy', async () => {
    const calls = mockApi({ 'POST /api/keys': { id: 1, name: 'Android widget', scope: 'read', prefix: 'coi_read_y', key: 'coi_read_ySECRET' } });
    renderApp(<AndroidSetup origin="https://coinio.example.com" />);
    expect(screen.getByRole('link', { name: /get scriptwidget/i })).toHaveAttribute('href', 'https://github.com/everettjf/scriptwidget/releases');
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    await user.click(screen.getByRole('button', { name: 'Prepare the widget' }));
    await user.click(await screen.findByRole('button', { name: 'Copy parameter' }));
    expect(calls).toContainEqual(expect.objectContaining({ method: 'POST', url: '/api/keys', body: { name: 'Android widget', scope: 'read' } }));
    expect(writeText).toHaveBeenCalledWith('https://coinio.example.com coi_read_ySECRET');
    // Own server: the remix step names this host.
    expect(screen.getByText(/coinio\.example\.com/, { selector: 'code' })).toBeInTheDocument();
  });

  it('skips the remix step on the hosted Coinio', () => {
    mockApi({});
    renderApp(<AndroidSetup origin="https://app.getcoinio.me" />);
    expect(screen.queryByText(/networkDomains/)).toBeNull();
  });
});
