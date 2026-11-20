import { CATEGORY_LABELS, searchCatalog, type CatalogEntry } from '../../shared/catalog';
import { t, useLocale } from '../i18n';

/** Popular services matching what is typed; picking one fills the form. Hidden once a website is set. */
export function CatalogSuggestions({ query, hidden, onPick }: { query: string; hidden: boolean; onPick: (s: CatalogEntry, categoryLabel: string) => void }) {
  const { locale } = useLocale();
  const results = hidden ? [] : searchCatalog(query, 6);
  if (results.length === 0) return null;
  return (
    <ul role="listbox" aria-label={t('catalog.suggestions')} className="-mt-2 overflow-hidden rounded-ctl border border-line bg-card shadow-[var(--shadow)]">
      {results.map((s) => (
        <li key={s.id}>
          <button
            type="button"
            role="option"
            aria-selected={false}
            className="flex w-full min-w-0 flex-col px-3 py-2 text-left text-sm hover:bg-sunk focus-visible:bg-sunk focus-visible:outline-none"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(s, CATEGORY_LABELS[s.category][locale])}
          >
            <span className="truncate font-medium">{s.name}</span>
            <span className="truncate text-xs text-text-3">
              {s.domain} · {CATEGORY_LABELS[s.category][locale]}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
