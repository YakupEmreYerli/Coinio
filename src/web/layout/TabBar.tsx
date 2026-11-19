import { NavLink } from 'react-router-dom';
import { t } from '../i18n';
import { cn } from '../lib/cn';
import { NAV_BOTTOM, NAV_ITEMS } from './nav';

export function TabBar() {
  const items = [...NAV_ITEMS, ...NAV_BOTTOM].filter((i) => i.tab);
  return (
    <nav aria-label={t('nav.tabs')} className="grid border-t border-line bg-card px-1.5 pt-2 pb-[max(10px,env(safe-area-inset-bottom))]" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => cn('flex flex-col items-center gap-0.5 text-[10.5px] text-text-3', isActive && 'font-medium text-text')}
          >
            <Icon className="size-[22px]" strokeWidth={1.6} />
            {t(item.label)}
          </NavLink>
        );
      })}
    </nav>
  );
}
