import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ext } from '@coinio/ext';
import { addMessages, t } from '../i18n';
import { Login } from '../routes/Login';
import { render } from '@testing-library/react';
import { App } from '../App';
import { mockApi, renderApp } from './render';

afterEach(() => {
  delete ext.SignInExtras;
  delete ext.publicRoutes;
});

describe('web extension points', () => {
  it('leaves the sign-in screen as it is when empty', () => {
    renderApp(<Login />);
    expect(screen.queryByTestId('extra')).toBeNull();
  });

  it('renders extra sign-in content under the form', () => {
    ext.SignInExtras = () => <p data-testid="extra">More ways in</p>;
    renderApp(<Login />);
    expect(screen.getByTestId('extra')).toHaveTextContent('More ways in');
  });

  it('adds messages that win over the built-in ones', () => {
    addMessages({ en: { 'ext.test.hello': 'Hello' } });
    expect(t('ext.test.hello')).toBe('Hello');
  });
});

describe('extension routes', () => {
  it('replace a built-in page with the same path', async () => {
    mockApi({ 'GET /api/auth/state': { setupRequired: false, user: null } });
    ext.publicRoutes = [{ path: '/login', Component: () => <p>Custom sign-in</p> }];
    window.history.pushState({}, '', '/login');
    render(<App />);
    expect(await screen.findByText('Custom sign-in')).toBeInTheDocument();
  });
});
