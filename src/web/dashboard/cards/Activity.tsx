import { Logo } from '../../components/Logo';
import { Money } from '../../components/Money';
import { Card, CardHeader } from '../../components/ui/Card';
import { t, useLocale } from '../../i18n';
import { shortDate } from '../../lib/dates';
import { usePayments, useSubscriptions, useUndoPayment } from '../../lib/hooks';
import { Link } from 'react-router-dom';

/** The last five payments (or skips), each undoable. */
export function Activity() {
  const { locale } = useLocale();
  const payments = usePayments().data ?? [];
  const byId = new Map((useSubscriptions().data ?? []).map((s) => [s.id, s]));
  const undo = useUndoPayment();
  const recent = payments
    .filter((p) => p.status !== 'void' && byId.has(p.subscriptionId))
    .sort((a, b) => b.paidAt.localeCompare(a.paidAt))
    .slice(0, 5);
  if (recent.length === 0) return null;
  return (
    <Card>
      <CardHeader title={t('activity.title')} actions={<Link to="/payments" className="text-[13px] text-text-2 hover:text-text">{t('activity.all')}</Link>} />
      <ul>
        {recent.map((p) => {
          const s = byId.get(p.subscriptionId)!;
          const what = p.status === 'skipped' ? t('activity.skipped') : p.source === 'auto' ? t('activity.auto') : t('activity.manual');
          return (
            <li key={p.id} className="flex items-center gap-3 border-t border-line px-5 py-2.5 text-[13.5px]">
              <Logo sub={s} size={30} />
              <div className="min-w-0 flex-1">
                <b className="block truncate font-medium">{s.name}</b>
                <span className="text-xs text-text-3">
                  {what} · {shortDate(p.dueDate, locale)}
                </span>
              </div>
              {p.status !== 'skipped' && (
                p.actualBaseMinor !== null ? <Money minor={p.actualBaseMinor} currency={s.currency === p.currency ? p.currency : 'TRY'} size="sm" /> : <Money minor={p.amountMinor} currency={p.currency} size="sm" />
              )}
              <button type="button" className="text-xs text-accent hover:underline" onClick={() => undo.mutate(p.id)}>
                {t('common.undo')}
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
