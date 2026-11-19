import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Logo, monogramColor } from './Logo';

describe('Logo', () => {
  it('renders the stored logo image', () => {
    const { container } = render(<Logo sub={{ name: 'Netflix', logoPath: 'abc.png' }} />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/logos/abc.png');
  });

  it('Logo falls back to monogram on image error', () => {
    const { container } = render(<Logo sub={{ name: 'nextcloud storage', logoPath: 'gone.png' }} />);
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('N')).toBeInTheDocument();
  });

  it('uses Turkish uppercase for the monogram', () => {
    render(<Logo sub={{ name: 'iCloud+', logoPath: null }} />);
    expect(screen.getByText('İ')).toBeInTheDocument();
  });

  it('Logo monogram color is stable for same name', () => {
    expect(monogramColor('Hetzner')).toBe(monogramColor('Hetzner'));
    expect(monogramColor('Hetzner')).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
