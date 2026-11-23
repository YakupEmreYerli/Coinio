import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../../i18n';
import { mockApi, renderApp } from '../../test/render';
import { FamilySettings } from './Family';

beforeEach(() => setLocale('en'));
afterEach(() => vi.unstubAllGlobals());

describe('FamilySettings', () => {
  it('renders create form when user has no household and creates a family', async () => {
    let state: Record<string, unknown> = {
      household: null,
      members: [],
      invites: [],
      allowInviteSignup: true,
    };
    const calls = mockApi({
      'GET /api/family': () => state,
      'POST /api/family': (init: RequestInit & { method: string; url: string }) => {
        const b = (typeof init.body === 'string' ? JSON.parse(init.body) : init.body) as { name: string; members?: string[] };
        state = {
          household: { id: 1, name: b.name, ownerUserId: 1, myMemberId: 1, myRole: 'owner', createdAt: '' },
          members: [
            { id: 1, name: 'yakup', color: '#6366f1', role: 'owner', linkedUserId: 1, linkedUsername: 'yakup', isMe: true, createdAt: '' },
            ...(b.members ?? []).map((name, i) => ({
              id: i + 2,
              name,
              color: '#10b981',
              role: 'member',
              linkedUserId: null,
              linkedUsername: null,
              isMe: false,
              createdAt: '',
            })),
          ],
          invites: [],
          allowInviteSignup: true,
        };
        return state;
      },
    });

    renderApp(<FamilySettings />);
    fireEvent.change(await screen.findByLabelText(/family name/i), { target: { value: 'Yerli Home' } });
    fireEvent.change(screen.getByLabelText(/initial members/i), { target: { value: 'Annem, Babam' } });
    fireEvent.click(screen.getByRole('button', { name: /create family/i }));

    expect(await screen.findByText('Annem')).toBeInTheDocument();
    expect(screen.getByText('Babam')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST' && c.url === '/api/family')).toBe(true);
  });

  it('creates an invite link for an unlinked member', async () => {
    mockApi({
      'GET /api/family': {
        household: { id: 1, name: 'Ev', ownerUserId: 1, myMemberId: 1, myRole: 'owner', createdAt: '' },
        members: [
          { id: 1, name: 'yakup', color: '#6366f1', role: 'owner', linkedUserId: 1, linkedUsername: 'yakup', isMe: true, createdAt: '' },
          { id: 2, name: 'Annem', color: '#10b981', role: 'member', linkedUserId: null, linkedUsername: null, isMe: false, createdAt: '' },
        ],
        invites: [],
        allowInviteSignup: true,
      },
      'POST /api/family/invites': {
        id: 10,
        memberId: 2,
        token: 'tok1234567890',
        path: '/invite/tok1234567890',
        expiresAt: '2026-12-01T00:00:00Z',
      },
    });

    renderApp(<FamilySettings />);
    fireEvent.click(await screen.findByRole('button', { name: /create invite/i }));
    const linkCode = await screen.findByLabelText(/invite link/i);
    expect(linkCode.textContent).toContain('/invite/tok1234567890');
  });
});
