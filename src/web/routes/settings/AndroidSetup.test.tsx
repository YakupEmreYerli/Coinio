import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../i18n';
import { mockApi, renderApp } from '../../test/render';
import { AndroidSetup, androidSetupLink } from './AndroidSetup';

beforeEach(() => setLocale('en'));

describe('Android widget setup', () => {
  it('builds the link the Android app reads', () => {
    expect(androidSetupLink('https://a.b', 'coi_read_x')).toBe('coinio-widget://setup?url=https%3A%2F%2Fa.b&key=coi_read_x');
  });

  it('makes a read-only key, then shows the QR code and an open-in-app link', async () => {
    const calls = mockApi({ 'POST /api/keys': { id: 1, name: 'Android widget', scope: 'read', prefix: 'coi_read_y', key: 'coi_read_ySECRET' } });
    renderApp(<AndroidSetup origin="https://coinio.example.com" />);
    expect(screen.queryByTestId('android-qr')).toBeNull();
    expect(screen.getByRole('link', { name: /download the app/i })).toHaveAttribute('href', 'https://github.com/yakupemreyerli/coinio/releases/latest');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Connect Android' }));
    expect((await screen.findByTestId('android-qr')).querySelector('svg')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Open in the app' })).toHaveAttribute('href', 'coinio-widget://setup?url=https%3A%2F%2Fcoinio.example.com&key=coi_read_ySECRET');
    expect(calls).toContainEqual(expect.objectContaining({ method: 'POST', url: '/api/keys', body: { name: 'Android widget', scope: 'read' } }));
  });
});
