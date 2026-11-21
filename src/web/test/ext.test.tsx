import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ext } from '@coinio/ext';
import { addMessages, t } from '../i18n';
import { Login } from '../routes/Login';
import { renderApp } from './render';

afterEach(() => {
  delete ext.SignInExtras;
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
