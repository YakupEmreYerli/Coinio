import { t, useLocale } from '../../i18n';
import { longDate } from '../../lib/dates';
import { useUser } from '../../lib/user';
import { useDashboardData } from '../useDueItems';

function greetingKey(hour: number): string {
  if (hour < 5) return 'greet.night';
  if (hour < 12) return 'greet.morning';
  if (hour < 18) return 'greet.afternoon';
  return 'greet.evening';
}

export function Greeting() {
  const { locale } = useLocale();
  const { username } = useUser();
  const { summary, today } = useDashboardData();
  const month = today.slice(0, 7);
  const left = summary ? summary.overdue.length + summary.upcoming.filter((d) => d.dueDate.startsWith(month)).length : 0;
  const late = summary?.overdue.length ?? 0;
  return (
    <div className="pt-1">
      <h1 className="font-display text-[26px] leading-tight md:text-[30px]">
        {username ? t('greet.named', { greeting: t(greetingKey(new Date().getHours())), name: username }) : t(greetingKey(new Date().getHours()))}
      </h1>
      <p className="mt-0.5 text-text-2">
        {longDate(today, locale)}
        {summary && (
          <>
            {' · '}
            {left === 0 ? t('greet.nothingLeft') : t('greet.left', { n: left })}
            {late > 0 && (
              <>
                {t('greet.and')}
                <b className="font-medium text-neg">{t('greet.late', { n: late })}</b>
              </>
            )}
          </>
        )}
      </p>
    </div>
  );
}
