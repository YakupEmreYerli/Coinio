import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { api, ApiError } from '../../api';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { toast } from '../../components/ui/Toaster';
import { t } from '../../i18n';
import { useFirefly, useFireflyAccounts, useSubscriptions } from '../../lib/hooks';
import { keys } from '../../lib/query';
import type { FireflyAccount, FireflyConnection } from '../../lib/types';
import { Dated } from './ApiKeys';
import { Section } from './Section';

type Preview = {
  matched: { subscriptionId: number; billId: string; name: string }[];
  toFirefly: { subscriptionId: number; name: string }[];
  toCoinio: { billId: string; name: string }[];
};
type Counts = { coinio: number; firefly: number };
type SyncResult = { created: Counts; updated: Counts; deactivated: Counts; paymentsIn: number; paymentsOut: number };

const CODES = ['unauthorized', 'unreachable', 'not_found', 'rate_limited', 'bad_response', 'no_account', 'no_rate', 'internal'];
const codeText = (code: string | null | undefined) => (code && CODES.includes(code) ? t(`firefly.error.${code}`) : t('error.generic'));

/** What to tell the user when a Firefly request failed. */
function failure(e: unknown): string {
  if (e instanceof ApiError && e.code === 'firefly') return codeText(e.detail);
  if (e instanceof ApiError && e.code === 'validation') return t('firefly.error.address');
  return t('error.generic');
}

function resultText(r: SyncResult): string {
  const side = (s: keyof Counts) => r.created[s] + r.updated[s] + r.deactivated[s];
  return t('firefly.result', { coinio: side('coinio') + r.paymentsIn, firefly: side('firefly') + r.paymentsOut });
}

const accountOptions = (accounts: FireflyAccount[]) => accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currencyCode})` }));

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="flex gap-2 rounded-ctl bg-warn/10 px-3 py-2.5 text-[13px] text-text-2">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">{children}</div>
    </div>
  );
}

/** Address and token; Firefly is asked before anything is saved. */
function Connect() {
  const qc = useQueryClient();
  const [baseUrl, setBaseUrl] = useState('');
  const [token, setToken] = useState('');
  const save = useMutation({
    mutationFn: () => api.put<{ version: string; accounts: FireflyAccount[] }>('/firefly', { baseUrl: baseUrl.trim(), token: token.trim() }),
    onSuccess: ({ accounts }) => {
      qc.setQueryData(keys.fireflyAccounts, { accounts });
      void qc.invalidateQueries({ queryKey: keys.firefly, exact: true });
    },
  });
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (baseUrl.trim() && token.trim()) save.mutate();
      }}
    >
      <Input label={t('firefly.address')} placeholder="https://firefly.example.com" inputMode="url" autoComplete="off" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
      <Input label={t('firefly.token')} type="password" autoComplete="off" hint={t('firefly.tokenHint')} value={token} onChange={(e) => setToken(e.target.value)} />
      {save.isError && <p className="text-[13px] text-neg">{failure(save.error)}</p>}
      <Button type="submit" variant="primary" className="self-end" disabled={!baseUrl.trim() || !token.trim() || save.isPending}>
        {t('firefly.connect')}
      </Button>
    </form>
  );
}

function AccountSelect({ conn, accounts }: { conn: FireflyConnection; accounts: FireflyAccount[] | undefined }) {
  const qc = useQueryClient();
  const pick = useMutation({
    mutationFn: (assetAccountId: string) => api.patch('/firefly', { assetAccountId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.firefly, exact: true }),
    onError: (e) => toast.error(failure(e)),
  });
  return (
    <div className="flex flex-col gap-1.5">
      <Select label={t('firefly.account')} placeholder={t('firefly.accountPick')} value={conn.assetAccountId ?? ''} onChange={(v) => pick.mutate(v)} options={accountOptions(accounts ?? [])} />
      <p className="text-xs text-text-3">{accounts?.length === 0 ? t('firefly.noAccounts') : t('firefly.accountHint')}</p>
    </div>
  );
}

type Row = { key: string; name: string; on: boolean; toggle: () => void };

function PreviewList({ title, hint, rows }: { title: string; hint: string; rows: Row[] }) {
  if (!rows.length) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-text-2">{title}</span>
      <span className="text-xs text-text-3">{hint}</span>
      <ul className="flex flex-col rounded-ctl border border-line">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-3 border-b border-line px-3 py-2 text-sm last:border-b-0">
            <Checkbox checked={r.on} onChange={r.toggle} aria-label={r.name} />
            <span className="min-w-0 truncate">{r.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Before the first sync: the default account, then what the first run would link, add or leave out. */
function FirstSync({ conn, accounts, onDone }: { conn: FireflyConnection; accounts: FireflyAccount[] | undefined; onDone: (r: SyncResult) => void }) {
  const qc = useQueryClient();
  const preview = useQuery({ queryKey: ['firefly', 'preview'], queryFn: () => api.get<Preview>('/firefly/preview') });
  const [off, setOff] = useState<Set<string>>(new Set());
  const flip = (key: string) => () => setOff((s) => (s.has(key) ? new Set([...s].filter((k) => k !== key)) : new Set([...s, key])));
  const rows = (items: { key: string; name: string }[]) => items.map((i) => ({ ...i, on: !off.has(i.key), toggle: flip(i.key) }));
  const p = preview.data;
  const start = useMutation({
    mutationFn: () => {
      const ids = (prefix: string) => [...off].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
      return api.post<SyncResult>('/firefly/initial', {
        unmatch: ids('m:').map(Number),
        exclude: { subscriptions: ids('s:').map(Number), bills: ids('b:') },
      });
    },
    onSuccess: (r) => {
      onDone(r);
      void qc.invalidateQueries({ queryKey: keys.firefly });
    },
    onError: (e) => {
      toast.error(failure(e));
      void qc.invalidateQueries({ queryKey: keys.firefly, exact: true });
    },
  });
  return (
    <>
      <AccountSelect conn={conn} accounts={accounts} />
      {preview.isError && <p className="text-[13px] text-neg">{failure(preview.error)}</p>}
      {p && (
        <>
          <p className="text-[13px] text-text-2">{p.matched.length + p.toFirefly.length + p.toCoinio.length ? t('firefly.previewIntro') : t('firefly.previewEmpty')}</p>
          <PreviewList title={t('firefly.matched')} hint={t('firefly.matchedHint')} rows={rows(p.matched.map((m) => ({ key: `m:${m.subscriptionId}`, name: m.name })))} />
          <PreviewList title={t('firefly.toFirefly')} hint={t('firefly.newHint')} rows={rows(p.toFirefly.map((s) => ({ key: `s:${s.subscriptionId}`, name: s.name })))} />
          <PreviewList title={t('firefly.toCoinio')} hint={t('firefly.newHint')} rows={rows(p.toCoinio.map((b) => ({ key: `b:${b.billId}`, name: b.name })))} />
        </>
      )}
      <Button variant="primary" className="self-end" disabled={!p || !conn.assetAccountId || start.isPending} onClick={() => start.mutate()}>
        {t('firefly.start')}
      </Button>
    </>
  );
}

/** Firefly refused the saved token: a new one for the same address turns syncing back on. */
function NewToken({ conn }: { conn: FireflyConnection }) {
  const qc = useQueryClient();
  const [token, setToken] = useState('');
  const save = useMutation({
    mutationFn: () => api.put('/firefly', { baseUrl: conn.baseUrl, token: token.trim() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.firefly }),
  });
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        if (token.trim()) save.mutate();
      }}
    >
      <div className="flex-1">
        <Input label={t('firefly.newToken')} type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} error={save.isError ? failure(save.error) : undefined} />
      </div>
      <Button type="submit" disabled={!token.trim() || save.isPending}>
        {t('firefly.saveToken')}
      </Button>
    </form>
  );
}

function Excluded({ conn }: { conn: FireflyConnection }) {
  const qc = useQueryClient();
  const subs = useSubscriptions().data ?? [];
  const { subscriptions, bills } = conn.excluded;
  const patch = useMutation({
    mutationFn: (excluded: FireflyConnection['excluded']) => api.patch('/firefly', { excluded }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.firefly, exact: true }),
    onError: (e) => toast.error(failure(e)),
  });
  const rows = [
    ...subscriptions.map((id) => ({
      key: `s:${id}`, name: subs.find((s) => s.id === id)?.name ?? `#${id}`,
      bring: () => patch.mutate({ subscriptions: subscriptions.filter((x) => x !== id), bills }),
    })),
    ...bills.map((id) => ({
      key: `b:${id}`, name: t('firefly.excludedBill', { id }),
      bring: () => patch.mutate({ subscriptions, bills: bills.filter((x) => x !== id) }),
    })),
  ];
  if (!rows.length) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span id="firefly-excluded" className="text-[13px] font-medium text-text-2">
        {t('firefly.excluded')}
      </span>
      <ul aria-labelledby="firefly-excluded" className="flex flex-col rounded-ctl border border-line">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-3 border-b border-line px-3 py-2 text-sm last:border-b-0">
            <span className="min-w-0 flex-1 truncate">{r.name}</span>
            <Button size="sm" aria-label={t('firefly.includeNamed', { name: r.name })} disabled={patch.isPending} onClick={r.bring}>
              {t('firefly.include')}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Synced({ conn, accounts, result, setResult }: { conn: FireflyConnection; accounts: FireflyAccount[] | undefined; result: SyncResult | null; setResult: (r: SyncResult | null) => void }) {
  const qc = useQueryClient();
  const sync = useMutation({
    mutationFn: () => api.post<SyncResult>('/firefly/sync'),
    onMutate: () => setResult(null),
    onSuccess: setResult,
    onError: (e) => !(e instanceof ApiError && e.code === 'firefly') && toast.error(failure(e)),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.firefly }),
  });
  return (
    <>
      {conn.lastError === 'unauthorized' ? (
        <Warning>
          <span>{t('firefly.tokenRejected')}</span>
          <NewToken conn={conn} />
        </Warning>
      ) : (
        conn.lastError && <Warning>{codeText(conn.lastError)}</Warning>
      )}
      <AccountSelect conn={conn} accounts={accounts} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[13px] text-text-2" aria-live="polite">
          {result ? resultText(result) : conn.lastSyncAt ? <Dated label="firefly.lastSync" iso={conn.lastSyncAt} /> : t('firefly.neverSynced')}
        </span>
        <Button variant="primary" disabled={!conn.enabled || sync.isPending} onClick={() => sync.mutate()}>
          {t('firefly.syncNow')}
        </Button>
      </div>
      <Excluded conn={conn} />
    </>
  );
}

/** Two-way sync with the user's own Firefly III: connect, review the first run, then keep it running. */
export function FireflySetup() {
  const qc = useQueryClient();
  const firefly = useFirefly();
  const conn = firefly.data?.connection;
  const accounts = useFireflyAccounts(!!conn).data?.accounts;
  const [result, setResult] = useState<SyncResult | null>(null);
  const [confirm, setConfirm] = useState(false);
  const del = useMutation({
    mutationFn: () => api.del('/firefly'),
    onSuccess: () => {
      setResult(null);
      void qc.invalidateQueries({ queryKey: keys.firefly });
    },
    onError: (e) => toast.error(failure(e)),
  });
  return (
    <Section
      id="firefly"
      title={t('firefly.title')}
      description={t('firefly.desc')}
      footer={
        conn && (
          <Button variant="ghost" className="text-neg hover:text-neg" onClick={() => setConfirm(true)}>
            {t('firefly.disconnect')}
          </Button>
        )
      }
    >
      {firefly.isPending ? null : !conn ? (
        <Connect />
      ) : !conn.initialSyncDone ? (
        <FirstSync conn={conn} accounts={accounts} onDone={setResult} />
      ) : (
        <Synced conn={conn} accounts={accounts} result={result} setResult={setResult} />
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t('firefly.disconnectTitle')}
        body={t('firefly.disconnectBody')}
        confirmLabel={t('firefly.disconnect')}
        onConfirm={() => del.mutate()}
      />
    </Section>
  );
}
