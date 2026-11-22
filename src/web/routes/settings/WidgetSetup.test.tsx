import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import widgetSource from '../../../../widget/coinio-widget.js?raw';
import { setLocale } from '../../i18n';
import { mockApi, renderApp } from '../../test/render';
import { WidgetSetup, fillWidgetScript, unreachableFromPhone } from './WidgetSetup';

beforeEach(() => setLocale('en'));

describe('widget script', () => {
  it('writes the server address and the key into the two setting lines only', () => {
    const out = fillWidgetScript(widgetSource, 'https://subs.example.org', "coi_read_ab'c");
    expect(out).toContain("const SERVER_URL = 'https://subs.example.org';");
    expect(out).toContain("const API_KEY = 'coi_read_ab\\'c';");
    expect(out.split('\n').length).toBe(widgetSource.split('\n').length);
    expect(out).not.toContain('subs.example.com');
  });

  it('warns about addresses a phone cannot open from anywhere', () => {
    for (const bad of ['http://coinio.example.com', 'https://localhost:8080', 'https://192.168.1.20', 'https://10.0.0.5', 'https://nas.local', 'https://nas'])
      expect(unreachableFromPhone(bad), bad).toBe(true);
    expect(unreachableFromPhone('https://coinio.example.com')).toBe(false);
  });
});

describe('widget setup', () => {
  it('makes a read-only key and offers the filled-in script', async () => {
    const calls = mockApi({ 'POST /api/keys': { id: 1, name: 'iPhone widget', scope: 'read', prefix: 'coi_read_x', key: 'coi_read_xSECRET' } });
    renderApp(<WidgetSetup origin="https://coinio.example.com" />);
    expect(screen.queryByRole('alert')).toBeNull();
    const user = userEvent.setup();
    // after setup: user-event installs its own clipboard stub
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    await user.click(screen.getByRole('button', { name: 'Prepare the widget' }));
    await user.click(await screen.findByRole('button', { name: 'Copy script' }));
    expect(calls).toContainEqual(expect.objectContaining({ method: 'POST', url: '/api/keys', body: { name: 'iPhone widget', scope: 'read' } }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("const API_KEY = 'coi_read_xSECRET';"));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("const SERVER_URL = 'https://coinio.example.com';"));
  });

  it('shows the warning on a local address', () => {
    mockApi({});
    renderApp(<WidgetSetup origin="http://localhost:4660" />);
    expect(screen.getByRole('alert')).toHaveTextContent('http://localhost:4660');
  });
});
