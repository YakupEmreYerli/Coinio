import { Plus, X } from 'lucide-react';
import { useId, useState } from 'react';
import { t } from '../i18n';
import { cn } from '../lib/cn';

export const MAX_OFFSET = 60;

/** "30 days before", "On the due day" */
export const offsetLabel = (n: number) => (n === 0 ? t('notify.dueDay') : t('subs.daysBefore', { n }));

/** A list of "days before" chips with a small number box to add one; 0 is the due day. */
export function OffsetChips({ value, onChange, label }: { value: number[]; onChange: (v: number[]) => void; label: string }) {
  const [draft, setDraft] = useState('');
  const id = useId();
  const add = () => {
    const n = Number(draft);
    if (draft.trim() === '' || !Number.isInteger(n) || n < 0 || n > MAX_OFFSET) return;
    onChange([...new Set([...value, n])].sort((a, b) => b - a).slice(0, 10));
    setDraft('');
  };
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      {value.map((n) => (
        <span key={n} className="inline-flex h-7 items-center gap-1 rounded-full border border-line-2 bg-sunk pr-1 pl-2.5 text-[12.5px] font-medium">
          {offsetLabel(n)}
          <button
            type="button"
            aria-label={t('notify.removeOffset', { label: offsetLabel(n) })}
            onClick={() => onChange(value.filter((x) => x !== n))}
            className="grid size-5 place-items-center rounded-full text-text-3 hover:bg-card hover:text-text"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      {value.length === 0 && <span className="text-[12.5px] text-text-3">{t('notify.noOffsets')}</span>}
      <span className={cn('inline-flex h-7 items-center rounded-full border border-dashed border-line-2 pl-2.5 focus-within:border-accent')}>
        <label htmlFor={id} className="sr-only">{t('notify.addOffset')}</label>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          max={MAX_OFFSET}
          value={draft}
          placeholder={t('notify.daysShort')}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          className="w-12 bg-transparent text-[12.5px] outline-none placeholder:text-text-3 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button type="button" aria-label={t('notify.addOffset')} onClick={add} className="grid size-7 place-items-center rounded-full text-text-2 hover:text-text">
          <Plus className="size-3.5" />
        </button>
      </span>
    </div>
  );
}
