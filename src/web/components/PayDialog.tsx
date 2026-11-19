import { useEffect, useState } from 'react';
import { Button } from './ui/Button';
import { Dialog, DialogBody, DialogContent, DialogFooter } from './ui/Dialog';
import { Input } from './ui/Input';
import { t, useLocale } from '../i18n';
import { formatAmountInput, parseAmount } from '../subscription-form/amount';

export type PayTarget = { subscriptionId: number; name: string; dueDate: string; amountMinor: number; currency: string; base: string };

/** Asks for the real amount (variable bills, foreign currency) before marking paid. Both fields are optional. */
export function PayDialog({ target, onClose, onPay }: { target: PayTarget | null; onClose: () => void; onPay: (v: { amountMinor?: number; actualBaseMinor?: number }) => void }) {
  const { locale } = useLocale();
  const [amount, setAmount] = useState('');
  const [actual, setActual] = useState('');
  const foreign = !!target && target.currency !== target.base;
  useEffect(() => {
    if (target) {
      setAmount(formatAmountInput(target.amountMinor, locale));
      setActual('');
    }
  }, [target, locale]);
  const submit = () => {
    const a = parseAmount(amount, locale);
    const b = actual.trim() ? parseAmount(actual, locale) : null;
    onPay({ amountMinor: a ?? undefined, actualBaseMinor: b ?? undefined });
  };
  return (
    <Dialog open={!!target} onOpenChange={(v) => !v && onClose()}>
      <DialogContent title={t('pay.title', { name: target?.name ?? '' })} description={t('pay.description')} size="sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <DialogBody>
            <Input label={t('pay.amount', { currency: target?.currency ?? '' })} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
            {foreign && (
              <Input label={t('pay.actual', { currency: target!.base })} hint={t('pay.actualHint')} inputMode="decimal" value={actual} onChange={(e) => setActual(e.target.value)} />
            )}
          </DialogBody>
          <DialogFooter>
            <Button onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" variant="primary">
              {t('pay.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
