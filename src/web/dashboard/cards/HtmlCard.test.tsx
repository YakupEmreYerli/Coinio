import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HtmlCard } from './HtmlCard';

describe('HtmlCard', () => {
  it('html card iframe has sandbox allow-scripts without allow-same-origin', () => {
    render(<HtmlCard card={{ id: 'note', title: 'Not', html: '<b>merhaba</b><script>parent.document.title="x"</script>', height: 200 }} />);
    const frame = screen.getByTitle('Not') as HTMLIFrameElement;
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
    expect(frame.getAttribute('srcdoc')).toContain('<b>merhaba</b>');
    expect(frame.style.height).toBe('200px');
  });
});
