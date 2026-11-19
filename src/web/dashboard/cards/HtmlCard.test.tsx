import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE } from '../../../shared/appearance';
import { AppearanceProvider } from '../../lib/appearanceContext';
import { HtmlCard, cardDocument } from './HtmlCard';

const note = { id: 'note', title: 'Not', html: '<b>merhaba</b><script>parent.document.title="x"</script>', height: 200 };

describe('HtmlCard', () => {
  it('html card iframe has sandbox allow-scripts without allow-same-origin', () => {
    render(<HtmlCard card={note} />);
    const frame = screen.getByTitle('Not') as HTMLIFrameElement;
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
    expect(frame.getAttribute('srcdoc')).toContain('<b>merhaba</b>');
    expect(frame.style.height).toBe('200px');
  });

  it('follows the dark theme so the frame is not painted white', () => {
    render(
      <AppearanceProvider value={{ ...DEFAULT_APPEARANCE, theme: 'night' }}>
        <HtmlCard card={note} />
      </AppearanceProvider>,
    );
    const doc = (screen.getByTitle('Not') as HTMLIFrameElement).getAttribute('srcdoc')!;
    expect(doc).toMatch(/^<style>:root\{color-scheme:dark;--accent:#4f5bd5\}/);
    expect(doc.indexOf('<b>merhaba</b>')).toBeGreaterThan(doc.indexOf('</style>'));
    expect(cardDocument('', { ...DEFAULT_APPEARANCE, theme: 'white' })).toContain('color-scheme:light');
  });

  it('safe mode shows a note instead of running the card', () => {
    render(<HtmlCard card={note} safe />);
    expect(screen.queryByTitle('Not')).toBeNull();
    expect(screen.getByText('Not')).toBeInTheDocument();
  });
});
