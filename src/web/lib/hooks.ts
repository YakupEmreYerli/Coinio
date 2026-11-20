import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { toast } from '../components/ui/Toaster';
import { t } from '../i18n';
import { keys } from './query';
import type { ApiPayment, ApiSubscription, Appearance, NotificationsPage, Settings, Summary } from './types';

export type PaymentFilter = { subscriptionId?: number; from?: string; to?: string; source?: 'manual' | 'auto'; status?: string };

const qs = (o: Record<string, unknown>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

function invalidateData(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: keys.subscriptions });
  void qc.invalidateQueries({ queryKey: keys.summary });
  void qc.invalidateQueries({ queryKey: ['payments'] });
  void qc.invalidateQueries({ queryKey: ['reports'] });
}

export const useSubscriptions = () =>
  useQuery({ queryKey: keys.subscriptions, queryFn: () => api.get<ApiSubscription[]>('/subscriptions?includeInactive=true') });
export const useSubscription = (id: number) =>
  useQuery({ queryKey: keys.subscription(id), queryFn: () => api.get<ApiSubscription>(`/subscriptions/${id}`) });
export const useSummary = () => useQuery({ queryKey: keys.summary, queryFn: () => api.get<Summary>('/summary') });
export const usePayments = (filter: PaymentFilter = {}) =>
  useQuery({ queryKey: keys.payments(filter), queryFn: () => api.get<ApiPayment[]>(`/payments${qs(filter)}`) });
export const useSettings = () => useQuery({ queryKey: keys.settings, queryFn: () => api.get<Settings>('/settings') });
export const useNotifications = () => useQuery({ queryKey: keys.notifications, queryFn: () => api.get<NotificationsPage>('/notifications') });
export const useAppearance = () => useQuery({ queryKey: keys.appearance, queryFn: () => api.get<Appearance>('/appearance') });

function useDataMutation<V, R>(fn: (v: V) => Promise<R>, onSuccess?: (r: R, v: V) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r, v) => {
      invalidateData(qc);
      onSuccess?.(r, v);
    },
    onError: () => toast.error(t('error.generic')),
  });
}

export const useCreateSubscription = () => useDataMutation((input: Record<string, unknown>) => api.post<ApiSubscription>('/subscriptions', input));
export const useUpdateSubscription = () =>
  useDataMutation(({ id, patch }: { id: number; patch: Record<string, unknown> }) => api.patch<ApiSubscription>(`/subscriptions/${id}`, patch));
export const useDeleteSubscription = () => useDataMutation((id: number) => api.del<void>(`/subscriptions/${id}`));
export const useUndoPayment = () => useDataMutation((paymentId: number) => api.del<void>(`/payments/${paymentId}`));
export const useUpdatePayment = () =>
  useDataMutation(({ id, patch }: { id: number; patch: { amountMinor?: number; actualBaseMinor?: number | null } }) => api.patch<ApiPayment>(`/payments/${id}`, patch));

type PayVars = { id: number; name: string; dueDate?: string; actualBaseMinor?: number; amountMinor?: number };

/** Marks a due date paid and offers a 5-second undo. */
export function usePay() {
  const undo = useUndoPayment();
  return useDataMutation(
    ({ id, name: _name, ...body }: PayVars) => api.post<ApiPayment>(`/subscriptions/${id}/pay`, body),
    (payment, v) => toast.undo(t('toast.paid', { name: v.name }), () => undo.mutate(payment.id), t('common.undo')),
  );
}

/** Skips one billing period, with undo. */
export function useSkip() {
  const undo = useUndoPayment();
  return useDataMutation(
    ({ id, dueDate }: { id: number; name: string; dueDate?: string }) => api.post<ApiPayment>(`/subscriptions/${id}/skip`, { dueDate }),
    (payment, v) => toast.undo(t('toast.skipped', { name: v.name }), () => undo.mutate(payment.id), t('common.undo')),
  );
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Settings>) => api.patch<Settings>('/settings', patch),
    onSuccess: (s) => {
      qc.setQueryData(keys.settings, s);
      invalidateData(qc);
    },
    onError: () => toast.error(t('error.generic')),
  });
}

export function useSaveAppearance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: Appearance) => api.put<Appearance>('/appearance', a),
    // Local state is the truth: apply at once, and never let a late server echo undo a newer edit.
    onMutate: (a) => qc.setQueryData(keys.appearance, a),
    onError: () => toast.error(t('error.generic')),
  });
}

export type Report = {
  base: string;
  months: { month: string; paidMinor: number; projectedMinor: number }[];
  byCategory: { category: string | null; monthlyMinor: number }[];
  top: { subscriptionId: number; name: string; monthlyMinor: number }[];
  foreignShare: { minor: number; percent: number };
};
export const useReports = () => useQuery({ queryKey: ['reports'], queryFn: () => api.get<Report>('/reports') });
