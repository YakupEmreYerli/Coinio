import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../i18n';
import { mockApi, renderApp } from '../test/render';
import { InviteAccept } from './InviteAccept';

beforeEach(() => setLocale('en'));
afterEach(() => vi.unstubAllGlobals());

function renderInvite(user: { id: number; username: string } | null) {
  return renderApp(
    <Routes>
      <Route path="/invite/:token" element={<InviteAccept user={user} />} />
    </Routes>,
    { route: '/invite/secret-token-123' },
  );
}

describe('InviteAccept', () => {
  it('shows self-hosted signup form when signed out and allowInviteSignup is true', async () => {
    mockApi({
      'GET /api/family/invite/secret-token-123': {
        valid: true,
        expired: false,
        used: false,
        householdName: 'Ailem',
        memberName: 'Annem',
        memberRelation: 'mother',
        allowInviteSignup: true,
        signedIn: false,
        alreadyInHousehold: false,
      },
    });
    renderInvite(null);
    expect(await screen.findByRole('button', { name: /create account & join/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
  });

  it('redirects to login/signup when allowInviteSignup is false (Cloud)', async () => {
    mockApi({
      'GET /api/family/invite/secret-token-123': {
        valid: true,
        expired: false,
        used: false,
        householdName: 'CloudFam',
        memberName: 'Partner',
        memberRelation: 'partner',
        allowInviteSignup: false,
        signedIn: false,
        alreadyInHousehold: false,
      },
    });
    renderInvite(null);
    const signIn = await screen.findByRole('link', { name: /sign in to join/i });
    expect(signIn).toHaveAttribute('href', '/login?next=%2Finvite%2Fsecret-token-123');
    expect(screen.queryByRole('button', { name: /create account & join/i })).not.toBeInTheDocument();
  });

  it('shows join button when signed in and expired notice when expired', async () => {
    mockApi({
      'GET /api/family/invite/secret-token-123': {
        valid: true,
        expired: false,
        used: false,
        householdName: 'Ailem',
        memberName: 'Kardesim',
        memberRelation: 'sibling',
        allowInviteSignup: false,
        signedIn: true,
        alreadyInHousehold: false,
      },
    });
    const first = renderInvite({ id: 5, username: 'bro' });
    expect(await screen.findByRole('button', { name: /join family/i })).toBeInTheDocument();
    first.unmount();

    mockApi({
      'GET /api/family/invite/secret-token-123': {
        valid: false,
        expired: true,
        used: false,
        householdName: 'Ailem',
        memberName: 'Kardesim',
        memberRelation: 'sibling',
        allowInviteSignup: true,
        signedIn: false,
        alreadyInHousehold: false,
      },
    });
    renderInvite(null);
    expect(await screen.findByText(/this invite link has expired/i)).toBeInTheDocument();
  });
});
