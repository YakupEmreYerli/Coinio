import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { toast } from '../components/ui/Toaster';
import { t } from '../i18n';
import { failureText } from './failure';
import { useFamilyScope } from './familyScope';
import { keys } from './query';
import type {
  ApiFamilyState,
  ApiInviteCreated,
  ApiPayment,
  ApiSubscription,
  Appearance,
  FamilyRelation,
  FireflyAccount,
  FireflyConnection,
  NotificationsPage,
  Settings,
  Summary,
} from './types';

export type PaymentFilter = { subscriptionId?: number; from?: string; to?: string; source?: 'manual' | 'auto' | 'firefly'; status?: string };

const qs = (o: Record<string, unknown>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

function invalidateData(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: keys.subscriptions });
  void qc.invalidateQueries({ queryKey: keys.summary });
  void qc.invalidateQueries({ queryKey: ['payments'] });
  void qc.invalidateQueries({ queryKey: ['reports'] });
}

export function useSubscriptions() {
  const { scope, memberId } = useFamilyScope();
  const isDefault = scope === 'mine' && memberId === null;
  return useQuery({
    queryKey: isDefault ? keys.subscriptions : [...keys.subscriptions, scope, memberId],
    queryFn: () =>
      api.get<ApiSubscription[]>(
        isDefault
          ? '/subscriptions?includeInactive=true'
          : `/subscriptions${qs({ includeInactive: true, scope, memberId: memberId ?? undefined })}`,
      ),
  });
}

export const useSubscription = (id: number) =>
  useQuery({ queryKey: keys.subscription(id), queryFn: () => api.get<ApiSubscription>(`/subscriptions/${id}`) });

export function useSummary() {
  const { scope, memberId } = useFamilyScope();
  const isDefault = scope === 'mine' && memberId === null;
  return useQuery({
    queryKey: isDefault ? keys.summary : [...keys.summary, scope, memberId],
    queryFn: () =>
      api.get<Summary>(isDefault ? '/summary' : `/summary${qs({ scope, memberId: memberId ?? undefined })}`),
  });
}

export const usePayments = (filter: PaymentFilter = {}) =>
  useQuery({ queryKey: keys.payments(filter), queryFn: () => api.get<ApiPayment[]>(`/payments${qs(filter)}`) });
export const useSettings = () => useQuery({ queryKey: keys.settings, queryFn: () => api.get<Settings>('/settings') });
export const useNotifications = () => useQuery({ queryKey: keys.notifications, queryFn: () => api.get<NotificationsPage>('/notifications') });
export const useAppearance = () => useQuery({ queryKey: keys.appearance, queryFn: () => api.get<Appearance>('/appearance') });
export const useFamily = () => useQuery({ queryKey: keys.family, queryFn: () => api.get<ApiFamilyState>('/family') });
export const useFirefly = (enabled = true) =>
  useQuery({ queryKey: keys.firefly, queryFn: () => api.get<{ connection: FireflyConnection | null }>('/firefly'), enabled });
/** Asset accounts of the connected Firefly III; asks Firefly itself, so only once a connection exists. */
export const useFireflyAccounts = (enabled: boolean) =>
  useQuery({ queryKey: keys.fireflyAccounts, queryFn: () => api.get<{ accounts: FireflyAccount[] }>('/firefly/accounts'), enabled, retry: false });

function useDataMutation<V, R>(fn: (v: V) => Promise<R>, onSuccess?: (r: R, v: V) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r, v) => {
      invalidateData(qc);
      onSuccess?.(r, v);
    },
    onError: (e: unknown) => toast.error(failureText(e)),
  });
}

function useFamilyMutation<V, R = ApiFamilyState>(fn: (v: V) => Promise<R>, updateCache = true) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      if (updateCache && r && typeof r === 'object' && 'household' in r) {
        qc.setQueryData(keys.family, r);
      } else {
        void qc.invalidateQueries({ queryKey: keys.family });
      }
      invalidateData(qc);
    },
    onError: (e: unknown) => toast.error(failureText(e)),
  });
}

export const useCreateFamily = () =>
  useFamilyMutation((body: { name: string; ownerName?: string; ownerRelation?: FamilyRelation | null; members?: (string | { name: string; relation?: FamilyRelation | null })[] }) =>
    api.post<ApiFamilyState>('/family', body),
  );
export const useUpdateFamily = () =>
  useFamilyMutation((body: { name: string }) => api.patch<ApiFamilyState>('/family', body));
export const useDeleteFamily = () => useFamilyMutation<void, void>(() => api.del<void>('/family'), false);
export const useLeaveFamily = () => useFamilyMutation<void, void>(() => api.post<void>('/family/leave'), false);
export const useAddMember = () =>
  useFamilyMutation((body: { name: string; relation?: FamilyRelation | null; color?: string | null }) =>
    api.post<ApiFamilyState>('/family/members', body),
  );
export const useUpdateMember = () =>
  useFamilyMutation(({ id, patch }: { id: number; patch: { name?: string; relation?: FamilyRelation | null; color?: string | null } }) =>
    api.patch<ApiFamilyState>(`/family/members/${id}`, patch),
  );
export const useDeleteMember = () =>
  useFamilyMutation((id: number) => api.del<ApiFamilyState>(`/family/members/${id}`));
export const useCreateInvite = () =>
  useFamilyMutation((memberId: number) => api.post<ApiInviteCreated>('/family/invites', { memberId }), false);
export const useRevokeInvite = () =>
  useFamilyMutation((id: number) => api.del<void>(`/family/invites/${id}`), false);

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
    onError: (e: unknown) => toast.error(failureText(e)),
  });
}

export function useSaveAppearance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: Appearance) => api.put<Appearance>('/appearance', a),
    // Local state is the truth: apply at once, and never let a late server echo undo a newer edit.
    onMutate: (a) => qc.setQueryData(keys.appearance, a),
    onError: (e: unknown) => toast.error(failureText(e)),
  });
}

export type Report = {
  base: string;
  months: { month: string; paidMinor: number; projectedMinor: number }[];
  byCategory: { category: string | null; monthlyMinor: number }[];
  byMember?: { memberId: number; name: string; relation?: string | null; color: string | null; monthlyMinor: number }[];
  top: { subscriptionId: number; name: string; monthlyMinor: number }[];
  foreignShare: { minor: number; percent: number };
  unconvertible?: number[];
  ratesStale?: boolean;
};

export function useReports() {
  const { scope, memberId } = useFamilyScope();
  const isDefault = scope === 'mine' && memberId === null;
  return useQuery({
    queryKey: isDefault ? ['reports'] : ['reports', scope, memberId],
    queryFn: () =>
      api.get<Report>(isDefault ? '/reports' : `/reports${qs({ scope, memberId: memberId ?? undefined })}`),
  });
}
