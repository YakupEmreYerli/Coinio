import { Pause, Pencil, Play, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { offsetLabel } from '../components/OffsetChips';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Logo } from '../components/Logo';
import { Money } from '../components/Money';
import { Button } from '../components/ui/Button';
import { Sheet, SheetContent } from '../components/ui/Sheet';
import { t, useLocale } from '../i18n';
import { useSubscriptionForm } from '../layout/subscriptionForm';
import { cycleLabel } from '../lib/cycle';
import { shortDate } from '../lib/dates';
import { useDeleteSubscription, useFamily, useUpdateSubscription } from '../lib/hooks';
import type { ApiSubscription } from '../lib/types';
import { PaymentHistory } from './PaymentHistory';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-line px-5 py-3 text-sm">
      <span className="text-text-2">{label}</span>
      <span className="min-w-0 truncate text-right">{children}</span>
    </div>
  );
}

export function SubscriptionDetail({ sub, base, onClose }: { sub: ApiSubscription | undefined; base: string; onClose: () => void }) {
  const { locale } = useLocale();
  const form = useSubscriptionForm();
  const update = useUpdateSubscription();
  const del = useDeleteSubscription();
  const members = new Map((useFamily().data?.members ?? []).map((m) => [m.id, m.name]));
  const [confirm, setConfirm] = useState(false);
  return (
    <Sheet open={!!sub} onOpenChange={(v) => !v && onClose()}>
      {sub && (
        <SheetContent title={sub.name}>
          <div className="flex flex-col items-center gap-2 px-5 pt-6 pb-5 text-center">
            <Logo sub={sub} size={64} />
            <h3 className="mt-1 text-lg font-medium">{sub.name}</h3>
            <Money minor={sub.amountMinor} currency={sub.currency} size="xl" approx={sub.variableAmount} />
            <span className="text-[13px] text-text-3">
              {cycleLabel(sub)}
              {!sub.active && ` · ${t('subs.paused')}`}
            </span>
            {sub.canEdit !== false && (
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={() => form.openEdit(sub.id)}>
                  <Pencil />
                  {t('upcoming.edit')}
                </Button>
                <Button size="sm" onClick={() => update.mutate({ id: sub.id, patch: { active: !sub.active } })}>
                  {sub.active ? <Pause /> : <Play />}
                  {sub.active ? t('upcoming.pause') : t('subs.resume')}
                </Button>
                <Button size="sm" variant="ghost" className="text-neg hover:text-neg" onClick={() => setConfirm(true)}>
                  <Trash2 />
                  {t('common.delete')}
                </Button>
              </div>
            )}
          </div>
          {sub.householdId && (
            <>
              <Field label={t('family.paidBy')}>
                {(sub.paidByMemberId && members.get(sub.paidByMemberId)) || t('family.sharedBadge')}
              </Field>
              {sub.myShareMinor !== undefined && (
                <Field label={t('family.myShare')}>
                  <Money minor={sub.myShareMinor} currency={sub.currency} size="sm" cents="inline" />
                </Field>
              )}
              {sub.splits && sub.splits.length > 0 && (
                <Field label={t('family.splitAmong')}>
                  {sub.splits.map((sp) => members.get(sp.memberId) ?? `#${sp.memberId}`).join(', ')}
                </Field>
              )}
            </>
          )}
          <Field label={t('form.nextDue')}>{sub.active ? shortDate(sub.nextDue, locale) : '—'}</Field>
          <Field label={t('form.autoPay')}>{sub.autoPay ? t('common.yes') : t('common.no')}</Field>
          {sub.paymentMethod && <Field label={t('form.method')}>{sub.paymentMethod}</Field>}
          {sub.category && <Field label={t('form.category')}>{sub.category}</Field>}
          {sub.domain && <Field label={t('form.domain')}>{sub.domain}</Field>}
          <Field label={t('form.reminder')}>{sub.reminderOffsets ? (sub.reminderOffsets.length ? sub.reminderOffsets.map(offsetLabel).join(', ') : t('notify.noOffsets')) : t('form.reminderDefaultShort')}</Field>
          {sub.trialEndsAt && <Field label={t('form.trialEnds')}>{shortDate(sub.trialEndsAt, locale)}</Field>}
          {sub.notes && <p className="border-t border-line px-5 py-3 text-sm whitespace-pre-wrap text-text-2">{sub.notes}</p>}
          <h4 className="border-t border-line bg-sunk px-5 py-2.5 text-[13px] font-medium text-text-2">{t('history.title')}</h4>
          <PaymentHistory subscriptionId={sub.id} base={base} />
          <ConfirmDialog
            open={confirm}
            onOpenChange={setConfirm}
            title={t('confirm.deleteTitle', { name: sub.name })}
            body={t('confirm.deleteBody')}
            confirmLabel={t('common.delete')}
            onConfirm={() => {
              del.mutate(sub.id);
              onClose();
            }}
          />
        </SheetContent>
      )}
    </Sheet>
  );
}
