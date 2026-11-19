import { t } from '../i18n';
import type { ApiSubscription } from './types';

/** "Her ay", "Her 3 ayda bir", "Her yıl"… */
export function cycleLabel(s: Pick<ApiSubscription, 'cycle' | 'intervalCount'>): string {
  const unit = s.cycle === 'weekly' ? 'week' : s.cycle === 'monthly' ? 'month' : 'year';
  return s.intervalCount === 1 ? t(`cycleLabel.${unit}`) : t(`cycleLabel.${unit}N`, { n: s.intervalCount });
}
