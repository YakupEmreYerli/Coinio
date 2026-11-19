import { createContext, useContext } from 'react';

export type SubscriptionPrefill = { name?: string; domain?: string | null; amountMinor?: number; cycle?: 'weekly' | 'monthly' | 'yearly'; category?: string | null };
export type SubscriptionFormApi = { openCreate: (prefill?: SubscriptionPrefill) => void; openEdit: (id: number) => void };

const Ctx = createContext<SubscriptionFormApi>({ openCreate: () => {}, openEdit: () => {} });
export const SubscriptionFormContext = Ctx.Provider;

/** Opens the add/edit subscription dialog from anywhere inside the shell. */
export const useSubscriptionForm = () => useContext(Ctx);
