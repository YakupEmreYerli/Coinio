import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link, NavLink, Navigate, useParams } from 'react-router-dom';
import { DemoLocked } from '../../demo/DemoBar';
import { DEMO } from '../../demo/flag';
import { t } from '../../i18n';
import { cn } from '../../lib/cn';
import { useIsMobile } from '../../lib/useMediaQuery';
import { SETTINGS_SECTIONS } from './sections';

/** Settings pages that work in the browser-only demo; the rest need the real server. */
const DEMO_READY = new Set(['general', 'appearance']);

export function SettingsLayout() {
  const { section } = useParams();
  const mobile = useIsMobile();
  const current = SETTINGS_SECTIONS.find((s) => s.id === section);
  if (section && !current) return <Navigate to="/settings" replace />;
  if (!section && !mobile) return <Navigate to="/settings/general" replace />;
  const page = current && (DEMO && !DEMO_READY.has(current.id) ? <DemoLocked><current.Component /></DemoLocked> : <current.Component />);

  const menu = (
    <nav aria-label={t('nav.settings')} className={cn(mobile ? 'overflow-hidden rounded-card border border-line bg-card' : 'flex flex-col')}>
      {SETTINGS_SECTIONS.map((s) => {
        const Icon = s.icon;
        return (
          <NavLink
            key={s.id}
            to={`/settings/${s.id}`}
            className={({ isActive }) =>
              cn(
                mobile ? 'flex items-center gap-3 border-b border-line px-4 py-3.5 text-[15px] last:border-b-0' : 'mb-px flex items-center gap-3 rounded-[8px] px-3 py-2 text-sm text-text-2 hover:bg-sunk hover:text-text',
                !mobile && isActive && 'bg-card font-medium text-text shadow-[0_0_0_1px_var(--line)]',
              )
            }
          >
            <Icon className="size-4 shrink-0 text-text-3" />
            {t(s.label)}
            {mobile && <ChevronRight className="ml-auto size-4 text-text-3" />}
          </NavLink>
        );
      })}
    </nav>
  );

  return (
    <div className="px-4 pt-2 pb-12 md:px-9">
      {mobile && current ? (
        <Link to="/settings" className="mb-2 inline-flex items-center gap-1 text-sm text-text-2">
          <ChevronLeft className="size-4" />
          {t('nav.settings')}
        </Link>
      ) : (
        <h1 className="mb-5 font-display text-[26px] leading-tight md:text-[30px]">{t('nav.settings')}</h1>
      )}
      {mobile ? (
        current ? (
          page
        ) : (
          menu
        )
      ) : (
        <div className="grid items-start gap-[var(--gap)] lg:grid-cols-[220px_minmax(0,720px)]">
          {menu}
          {page}
        </div>
      )}
    </div>
  );
}
