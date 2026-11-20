import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../i18n';
import { ErrorBoundary } from './ErrorBoundary';

let broken = true;
function Flaky() {
  if (broken) throw new Error('bad date: 2026-13-40');
  return <p>Recovered</p>;
}

beforeEach(() => {
  setLocale('en');
  broken = true;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('ErrorBoundary', () => {
  it('shows the page fallback with details, and Try again renders the page once it works', async () => {
    render(<ErrorBoundary><Flaky /></ErrorBoundary>);
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong on this page');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Details' }));
    expect(screen.getByText('bad date: 2026-13-40')).toBeInTheDocument();
    broken = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('Recovered')).toBeInTheDocument();
  });

  it('a broken card shows the compact fallback while its neighbours render', () => {
    render(
      <>
        <ErrorBoundary variant="card"><Flaky /></ErrorBoundary>
        <ErrorBoundary variant="card"><p>Other card</p></ErrorBoundary>
      </>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent("This card couldn't load");
    expect(screen.getByText('Other card')).toBeInTheDocument();
  });

  it('clears the error when the reset key changes (another page)', () => {
    const { rerender } = render(<ErrorBoundary resetKey="/a"><Flaky /></ErrorBoundary>);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    broken = false;
    rerender(<ErrorBoundary resetKey="/b"><Flaky /></ErrorBoundary>);
    expect(screen.getByText('Recovered')).toBeInTheDocument();
  });
});
