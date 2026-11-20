import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderApp } from '../../test/render';
import { HtmlCard } from './HtmlCard';

const summary = {
  base: 'TRY', leftThisMonthMinor: 12345, monthlyAverageMinor: 50000, ratesStale: false, excludedCount: 0,
  overdue: [], upcoming: [{ subscriptionId: 1, name: 'Netflix', dueDate: '2026-11-23', amountMinor: 22999, currency: 'TRY', baseMinor: 22999 }],
  paidThisMonth: [], yearlyTotalMinor: 0,
};
const card = (shareData: boolean) => ({ id: 'n', title: 'Next', html: '<p>x</p>', height: 120, shareData });

afterEach(() => vi.unstubAllGlobals());

function spyFrame() {
  const frame = screen.getByTitle('Next') as HTMLIFrameElement;
  const post = vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation(() => {});
  return { frame, post };
}

describe('HTML card data bridge', () => {
  it('posts the widget-shaped summary only when the card may read data', async () => {
    const calls = mockApi({ 'GET /api/summary': summary });
    renderApp(<HtmlCard card={card(true)} />);
    const { post } = spyFrame();
    await vi.waitFor(() => expect(post).toHaveBeenCalled());
    const [message, origin] = post.mock.calls[0]!;
    expect(origin).toBe('*');
    expect(message).toMatchObject({ type: 'coinio:data', version: 1, data: { base: 'TRY', leftThisMonthMinor: 12345, items: [{ name: 'Netflix' }] } });
    expect(Object.keys((message as { data: object }).data).sort()).toEqual(['base', 'digits', 'generatedAt', 'items', 'leftThisMonthMinor', 'monthlyAverageMinor', 'ratesStale']);
    expect(calls.some((c) => c.url === '/api/summary')).toBe(true);
  });

  it('never posts when sharing is off', async () => {
    const calls = mockApi({ 'GET /api/summary': summary });
    renderApp(<HtmlCard card={card(false)} />);
    const { post } = spyFrame();
    await new Promise((r) => setTimeout(r, 50));
    expect(post).not.toHaveBeenCalled();
    expect(calls.some((c) => c.url === '/api/summary')).toBe(false);
  });

  it('answers request-data from its own frame and ignores other windows', async () => {
    mockApi({ 'GET /api/summary': summary });
    renderApp(<HtmlCard card={card(true)} />);
    const { frame, post } = spyFrame();
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'coinio:request-data' }, source: window }));
    expect(post).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'coinio:request-data' }, source: frame.contentWindow }));
    expect(post).toHaveBeenCalledTimes(2);
  });
});
