import { NavLink } from 'react-router-dom';
import { t } from '../i18n';
import { useSubscriptions } from '../lib/hooks';
import { cn } from '../lib/cn';
import { useCategoryColor } from '../lib/categoryColor';
import { categoryCounts } from './categories';
import { NAV_BOTTOM, NAV_ITEMS, type NavItem } from './nav';
import { Wordmark } from './Wordmark';

function Item({ item, count }: { item: NavItem; count?: number }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end ?? item.to === '/settings'}
      className={({ isActive }) =>
        cn(
          'mb-px flex items-center gap-3 rounded-[8px] px-2.5 py-2 text-sm text-text-2 hover:bg-sunk hover:text-text',
          isActive && 'bg-card font-medium text-text shadow-[0_0_0_1px_var(--line)] [&>svg]:text-accent',
        )
      }
    >
      <Icon className="size-[17px] shrink-0" strokeWidth={1.6} />
      {t(item.label)}
      {count !== undefined && <span className="ml-auto rounded-[6px] bg-sunk px-1.5 text-[11.5px] text-text-2">{count}</span>}
    </NavLink>
  );
}

export function Sidebar() {
  const subs = useSubscriptions().data ?? [];
  const colorOf = useCategoryColor();
  const cats = categoryCounts(subs);
  const active = subs.filter((s) => s.active).length;
  return (
    <aside className="flex h-full flex-col border-r border-line bg-side px-3.5 py-[18px]">
      <div className="flex h-9 items-center px-2.5 pb-[18px] pt-1 text-text">
        <Wordmark height={17} label={t('app.name')} />
      </div>
      <nav aria-label={t('nav.main')}>
        {NAV_ITEMS.map((item) => (
          <Item key={item.to} item={item} count={item.to === '/subscriptions' && active ? active : undefined} />
        ))}
      </nav>
      {cats.length > 0 && (
        <nav aria-label={t('nav.categories')} className="mt-2 min-h-0 overflow-y-auto">
          <div className="px-2.5 pt-4 pb-2 text-xs text-text-3">{t('nav.categories')}</div>
          {cats.map((c) => (
            <NavLink
              key={c.name}
              to={`/subscriptions?category=${encodeURIComponent(c.name)}`}
              className="mb-px flex items-center gap-3 rounded-[8px] px-2.5 py-1.5 text-sm text-text-2 hover:bg-sunk hover:text-text"
            >
              <span className="grid size-[17px] place-items-center">
                <span className="size-2 rounded-full" style={{ background: colorOf(c.name) }} />
              </span>
              <span className="truncate">{c.name}</span>
              <span className="ml-auto text-[11.5px] text-text-3">{c.count}</span>
            </NavLink>
          ))}
        </nav>
      )}
      <nav aria-label={t('nav.secondary')} className="mt-auto pt-3">
        {NAV_BOTTOM.map((item) => (
          <Item key={item.to} item={item} />
        ))}
      </nav>
    </aside>
  );
}
