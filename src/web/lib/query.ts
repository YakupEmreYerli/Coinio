import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 1 } },
});

export const keys = {
  subscriptions: ['subscriptions'] as const,
  subscription: (id: number) => ['subscriptions', id] as const,
  summary: ['summary'] as const,
  payments: (filter: object = {}) => ['payments', filter] as const,
  settings: ['settings'] as const,
  appearance: ['appearance'] as const,
  notifications: ['notifications'] as const,
  notificationLog: ['notifications', 'log'] as const,
  firefly: ['firefly'] as const,
  fireflyAccounts: ['firefly', 'accounts'] as const,
};
