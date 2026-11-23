import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Users } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { toast } from '../components/ui/Toaster';
import { t } from '../i18n';
import { formatMemberLabel, relationOptions } from '../lib/memberLabel';
import { keys } from '../lib/query';
import type { ApiInvitePreview, FamilyRelation } from '../lib/types';
import { AuthLayout } from '../onboarding/AuthLayout';
import { PasswordField } from '../onboarding/PasswordField';
import { FormError } from './AuthForm';
import { MIN_PASSWORD_LENGTH } from './Setup';

export function InviteAccept({ user }: { user: { id: number; username: string } | null }) {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const preview = useQuery({
    queryKey: ['family', 'invite', token],
    queryFn: () => api.get<ApiInvitePreview>(`/family/invite/${encodeURIComponent(token)}`),
    retry: false,
  });

  const [displayName, setDisplayName] = useState('');
  const [relation, setRelation] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const data = preview.data;
  const roleChoices = relationOptions();

  useEffect(() => {
    if (!data) return;
    setDisplayName((cur) => cur || data.memberName || '');
    setRelation((cur) => cur || data.memberRelation || '');
  }, [data?.memberName, data?.memberRelation]);

  const inviteNext = `/invite/${encodeURIComponent(token)}`;
  const loginHref = `/login?next=${encodeURIComponent(inviteNext)}`;
  const signupHref = `/signup?next=${encodeURIComponent(inviteNext)}`;

  const acceptErrorText = (err: unknown): string => {
    if (err instanceof ApiError) {
      if (err.code === 'already_in_household') return t('invite.alreadyInFamily');
      if (err.code === 'username_taken') return t('invite.usernameTaken');
      if (err.code === 'invite_expired') return t('invite.expired');
      if (err.code === 'invite_used' || err.code === 'member_already_linked') return t('invite.used');
      if (err.code === 'too_many_attempts') return t('login.error.tooMany');
      if (err.code === 'invalid_credentials') return t('setup.error.invalid', { min: MIN_PASSWORD_LENGTH });
    }
    return t('error.generic');
  };

  async function acceptSignedIn(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post(`/family/invite/${encodeURIComponent(token)}/accept`, {
        ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
        relation: relation ? (relation as FamilyRelation) : null,
      });
      await qc.invalidateQueries({ queryKey: keys.family });
      await qc.invalidateQueries({ queryKey: keys.subscriptions });
      await qc.invalidateQueries({ queryKey: keys.summary });
      toast.success(t('invite.joined'));
      navigate('/', { replace: true });
    } catch (err) {
      setError(acceptErrorText(err));
      setBusy(false);
    }
  }

  async function submitSignup(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) return setError(t('auth.password.short', { min: MIN_PASSWORD_LENGTH }));
    if (password !== confirm) return setError(t('auth.password.mismatch'));
    setBusy(true);
    try {
      await api.post(`/family/invite/${encodeURIComponent(token)}/accept`, {
        username: username.trim(),
        password,
        ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
        relation: relation ? (relation as FamilyRelation) : null,
      });
      location.assign('/');
    } catch (err) {
      setError(acceptErrorText(err));
      setBusy(false);
    }
  }

  const invitedLabel = formatMemberLabel({
    name: data?.memberName ?? '',
    relation: data?.memberRelation ?? null,
    isMe: true,
  });

  const profileFields = (
    <div className="grid gap-3 sm:grid-cols-2">
      <Input
        label={t('invite.displayNameLabel')}
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        maxLength={60}
        className="h-11"
      />
      <Select label={t('invite.roleLabel')} value={relation} onChange={setRelation} options={roleChoices} />
    </div>
  );

  const content = (() => {
    if (preview.isPending) {
      return (
        <div className="flex items-center gap-2 text-sm text-text-2">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t('common.loading')}
        </div>
      );
    }
    if (preview.isError || !data) {
      return (
        <>
          <h1 className="font-display text-[28px] leading-[1.15] text-text">{t('invite.invalidTitle')}</h1>
          <p className="mt-2 text-[14px] text-text-2">{t('invite.invalidBody')}</p>
          <div className="mt-6">
            <Link to={user ? '/' : '/login'} className="inline-flex h-10 items-center rounded-ctl bg-primary px-4 text-sm font-medium text-primary-fg">
              {t('invite.backHome')}
            </Link>
          </div>
        </>
      );
    }
    if (!data.valid) {
      return (
        <>
          <h1 className="font-display text-[28px] leading-[1.15] text-text">
            {data.expired ? t('invite.expiredTitle') : data.used ? t('invite.usedTitle') : t('invite.invalidTitle')}
          </h1>
          <p className="mt-2 text-[14px] text-text-2">
            {data.expired ? t('invite.expired') : data.used ? t('invite.used') : t('invite.invalidBody')}
          </p>
          <div className="mt-6">
            <Link to={user ? '/' : '/login'} className="inline-flex h-10 items-center rounded-ctl bg-primary px-4 text-sm font-medium text-primary-fg">
              {t('invite.backHome')}
            </Link>
          </div>
        </>
      );
    }

    if (user || data.signedIn) {
      return (
        <>
          <div className="mb-3 inline-flex size-10 items-center justify-center rounded-ctl bg-accent-soft text-accent">
            <Users className="size-5" aria-hidden />
          </div>
          <h1 className="font-display text-[28px] leading-[1.15] text-text">
            {t('invite.title', { household: data.householdName ?? '' })}
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-text-2">
            {t('invite.asMember', { member: invitedLabel })}
          </p>
          {data.alreadyInHousehold ? (
            <div className="mt-6 flex flex-col gap-4">
              <FormError>{t('invite.alreadyInFamily')}</FormError>
              <Link to="/" className="inline-flex h-10 items-center justify-center rounded-ctl bg-sunk px-4 text-sm font-medium text-text">
                {t('invite.backHome')}
              </Link>
            </div>
          ) : (
            <form onSubmit={acceptSignedIn} className="mt-6 flex flex-col gap-4">
              {profileFields}
              {error && <FormError>{error}</FormError>}
              <Button type="submit" variant="primary" disabled={busy} className="h-11 w-full justify-center">
                {busy && <Loader2 className="animate-spin" aria-hidden />}
                {t('invite.joinButton')}
              </Button>
            </form>
          )}
        </>
      );
    }

    if (!data.allowInviteSignup) {
      return (
        <>
          <div className="mb-3 inline-flex size-10 items-center justify-center rounded-ctl bg-accent-soft text-accent">
            <Users className="size-5" aria-hidden />
          </div>
          <h1 className="font-display text-[28px] leading-[1.15] text-text">
            {t('invite.title', { household: data.householdName ?? '' })}
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-text-2">
            {t('invite.cloudRequired', { member: invitedLabel })}
          </p>
          <div className="mt-6 flex flex-col gap-2.5">
            <Link to={loginHref} className="inline-flex h-11 items-center justify-center rounded-ctl bg-primary px-4 text-[14.5px] font-medium text-primary-fg">
              {t('invite.signInToJoin')}
            </Link>
            <Link to={signupHref} className="inline-flex h-11 items-center justify-center rounded-ctl border border-line bg-card px-4 text-[14.5px] font-medium text-text hover:bg-sunk">
              {t('invite.signUpToJoin')}
            </Link>
          </div>
        </>
      );
    }

    return (
      <>
        <div className="mb-3 inline-flex size-10 items-center justify-center rounded-ctl bg-accent-soft text-accent">
          <Users className="size-5" aria-hidden />
        </div>
        <h1 className="font-display text-[28px] leading-[1.15] text-text">
          {t('invite.title', { household: data.householdName ?? '' })}
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-text-2">
          {t('invite.signupIntro', { member: invitedLabel })}
        </p>
        <form onSubmit={submitSignup} className="mt-7 flex flex-col gap-4">
          {profileFields}
          <Input
            label={t('common.username')}
            name="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            autoFocus
            className="h-11"
          />
          <PasswordField
            label={t('common.password')}
            name="password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            min={MIN_PASSWORD_LENGTH}
            meter
            hint={t('auth.password.hint', { min: MIN_PASSWORD_LENGTH })}
          />
          <PasswordField
            label={t('auth.password.confirm')}
            name="passwordConfirm"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
          />
          {error && <FormError>{error}</FormError>}
          <Button type="submit" variant="primary" disabled={busy} className="mt-1 h-11 w-full justify-center text-[14.5px]">
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            {t('invite.createAndJoin')}
          </Button>
        </form>
        <p className="mt-4 text-center text-[13.5px] text-text-2">
          {t('invite.haveAccount')}{' '}
          <Link to={loginHref} className="font-medium text-text underline underline-offset-4">
            {t('login.submit')}
          </Link>
        </p>
      </>
    );
  })();

  if (user) {
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <div className="rounded-card border border-line bg-card p-6">{content}</div>
      </div>
    );
  }
  return <AuthLayout>{content}</AuthLayout>;
}
