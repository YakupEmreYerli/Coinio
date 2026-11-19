import { useMemo, useState, type ReactNode } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { t } from '../i18n';
import { SubscriptionFormContext, type SubscriptionFormApi, type SubscriptionPrefill } from '../layout/subscriptionForm';
import { useDeleteSubscription } from '../lib/hooks';
import type { ApiSubscription } from '../lib/types';
import { SubscriptionForm } from './SubscriptionForm';

/** Owns the single add/edit dialog and exposes open functions to the whole shell. */
export function SubscriptionFormHost({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; editId?: number; prefill?: SubscriptionPrefill }>({ open: false });
  const [toDelete, setToDelete] = useState<ApiSubscription | null>(null);
  const del = useDeleteSubscription();
  const api = useMemo<SubscriptionFormApi>(
    () => ({ openCreate: (prefill) => setState({ open: true, prefill }), openEdit: (editId) => setState({ open: true, editId }) }),
    [],
  );
  return (
    <SubscriptionFormContext value={api}>
      {children}
      <SubscriptionForm
        open={state.open}
        onOpenChange={(open) => setState((s) => ({ ...s, open }))}
        editId={state.editId}
        prefill={state.prefill}
        onDelete={(s) => setToDelete(s)}
      />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(v) => !v && setToDelete(null)}
        title={t('confirm.deleteTitle', { name: toDelete?.name ?? '' })}
        body={t('confirm.deleteBody')}
        confirmLabel={t('common.delete')}
        onConfirm={() => {
          if (!toDelete) return;
          del.mutate(toDelete.id);
          setState({ open: false });
        }}
      />
    </SubscriptionFormContext>
  );
}
