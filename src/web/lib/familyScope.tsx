import { createContext, useContext, useState, type ReactNode } from 'react';
import type { FamilyScope } from './types';

type FamilyScopeCtx = {
  scope: FamilyScope;
  memberId: number | null;
  setScope: (scope: FamilyScope) => void;
  setMemberId: (id: number | null) => void;
};

const noop = () => undefined;
const Context = createContext<FamilyScopeCtx>({
  scope: 'mine',
  memberId: null,
  setScope: noop,
  setMemberId: noop,
});

export function FamilyScopeProvider({ children }: { children: ReactNode }) {
  const [scope, setScopeState] = useState<FamilyScope>('mine');
  const [memberId, setMemberId] = useState<number | null>(null);
  const setScope = (next: FamilyScope) => {
    setScopeState(next);
    if (next === 'mine') setMemberId(null);
  };
  return <Context.Provider value={{ scope, memberId, setScope, setMemberId }}>{children}</Context.Provider>;
}

export function useFamilyScope(): FamilyScopeCtx {
  return useContext(Context);
}
