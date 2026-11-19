import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useAppearanceValue } from './appearanceContext';
import { useSaveAppearance } from './hooks';
import { keys } from './query';
import type { Appearance } from './types';

/** Live-preview edits: the page updates at once, the server copy is saved 600 ms after the last change. */
export function useAppearanceEditor() {
  const qc = useQueryClient();
  const current = useAppearanceValue();
  const save = useSaveAppearance();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<Appearance | null>(null);
  useEffect(
    () => () => {
      // Leaving the page saves what is still waiting.
      clearTimeout(timer.current);
      if (pending.current) save.mutate(pending.current);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const update = (change: Partial<Appearance> | ((a: Appearance) => Appearance)) => {
    const base = qc.getQueryData<Appearance>(keys.appearance) ?? current;
    const next = typeof change === 'function' ? change(base) : { ...base, ...change };
    qc.setQueryData(keys.appearance, next);
    pending.current = next;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      pending.current = null;
      save.mutate(next);
    }, 600);
  };
  return { appearance: current, update };
}
