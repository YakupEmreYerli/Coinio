import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../../i18n';
import { mockApi } from '../../test/render';
import { LogoPicker } from './LogoPicker';

const netflix = { id: 'brand:netflix', kind: 'brand', label: 'Netflix', previewUrl: '/api/logos/brand/netflix.svg?style=filled', size: null, hex: '#E50914' };
const site = { id: 'abc', kind: 'site', label: 'netflix.com', previewUrl: '/api/logos/proxy/abc', size: 180 };

function setup(onChange = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <LogoPicker name="Netflix" domain="netflix.com" value={{ kind: 'keep' }} onChange={onChange} current={null} />
    </QueryClientProvider>,
  );
  return onChange;
}

beforeEach(() => setLocale('en'));
afterEach(() => vi.unstubAllGlobals());

describe('LogoPicker', () => {
  it('picker lists candidates and selecting calls onChange', async () => {
    mockApi({ 'GET /api/logos/candidates': { candidates: [netflix, site] } });
    const onChange = setup();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /netflix\.com/i }));
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'candidate', candidateId: 'abc' });
    await user.click(screen.getByRole('button', { name: /^Netflix$/ }));
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'candidate', candidateId: 'brand:netflix', style: 'filled' });
  });

  it('picker rejects file over 512KB with message', async () => {
    mockApi({ 'GET /api/logos/candidates': { candidates: [] } });
    const onChange = setup();
    const user = userEvent.setup();
    const big = new File([new Uint8Array(600 * 1024)], 'big.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText(/upload/i), big);
    expect(await screen.findByText(/512 KB/)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'file' }));
  });

  it('accepts a small file and the badge option', async () => {
    mockApi({ 'GET /api/logos/candidates': { candidates: [] } });
    const onChange = setup();
    const user = userEvent.setup();
    const small = new File([new Uint8Array(1000)], 'a.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText(/upload/i), small);
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'file', file: small });
    await user.click(screen.getByRole('button', { name: /badge/i }));
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'none' });
  });
});
