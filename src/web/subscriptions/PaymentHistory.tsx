import { Undo2 } from 'lucide-react';
import { useState } from 'react';
import { Money } from '../components/Money';
import { t, useLocale } from '../i18n';
import { shortDate } from '../lib/dates';
import { usePayments, useUndoPayment, useUpdatePayment } from '../lib/hooks';
import type { ApiPayment } from '../lib/types';
import { amountInputMode, parseAmount } from '../subscription-form/amount';

function ActualCell({ p, base }: { p: ApiPayment; base: string }) {
  const { locale } = useLocale();
  const update = useUpdatePayment();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  if (p.status !== 'paid') return null;
  if (!editing) {
    return (
      <button type="button" aria-label={t('history.actual')} className="text-xs text-text-3 hover:text-accent" onClick={() => setEditing(true)} title={t('history.actual')}>
        {p.actualBaseMinor !== null ? <Money minor={p.actualBaseMinor} currency={base} size="sm" cents="inline" /> : t('history.addActual')}
      </button>
    );
  }
  const save = () => {
    const v = text.trim() ? parseAmount(text, locale, base) : null;
    if (text.trim() && v === null) return;
    update.mutate({ id: p.id, patch: { actualBaseMinor: v } });
    setEditing(false);
  };
  return (
    <input
      aria-label={t('history.actual')}
      autoFocus
      inputMode={amountInputMode(base)}
      className="h-7 w-24 rounded-[6px] border border-line-2 bg-card px-2 text-xs outline-none focus:border-accent"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') save();
        if (e.key === 'Escape') setEditing(false);
      }}
    />
  );
}

export function PaymentHistory({ subscriptionId, base }: { subscriptionId: number; base: string }) {
  const { locale } = useLocale();
  const payments = (usePayments({ subscriptionId }).data ?? []).filter((p) => p.subscriptionId === subscriptionId);
  const undo = useUndoPayment();
  if (payments.length === 0) return <p className="px-5 py-6 text-center text-[13px] text-text-3">{t('history.empty')}</p>;
  return (
    <ul>
      {payments.map((p) => (
        <li key={p.id} className="flex items-center gap-3 border-t border-line px-5 py-2.5 text-[13.5px]">
          <div className="min-w-0 flex-1">
            <b className="block font-medium">{shortDate(p.dueDate, locale)}</b>
            <span className="text-xs text-text-3">
              {p.status === 'skipped' ? t('activity.skipped') : p.status === 'void' ? t('history.void') : p.source === 'auto' ? t('activity.auto') : p.source === 'firefly' ? t('activity.firefly') : t('activity.manual')}
            </span>
          </div>
          <div className="flex flex-col items-end gap-0.5">
            {p.status === 'paid' && <Money minor={p.amountMinor} currency={p.currency} size="sm" />}
            {p.currency !== base && <ActualCell p={p} base={base} />}
          </div>
          {p.status !== 'void' && (
            <button type="button" aria-label={t('common.undo')} title={t('common.undo')} className="grid size-7 place-items-center rounded-[6px] text-text-3 hover:bg-sunk hover:text-text" onClick={() => undo.mutate(p.id)}>
              <Undo2 className="size-3.5" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
