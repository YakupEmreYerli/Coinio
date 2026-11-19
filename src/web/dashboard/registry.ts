import type { FC } from 'react';
import type { CardId } from '../lib/types';
import { Greeting } from './cards/Greeting';
import { MonthCard } from './cards/MonthCard';
import { StatsStrip } from './cards/StatsStrip';
import { UpcomingCard } from './cards/UpcomingCard';
import { Activity } from './cards/Activity';
import { AllSubscriptions } from './cards/AllSubscriptions';
import { Distribution } from './cards/Distribution';
import { QuickAdd } from './cards/QuickAdd';
import { WeekStrip } from './cards/WeekStrip';

export type CardDef = { title: string; Component: FC; span: 'full' | 'main' | 'side' };

/** Every built-in dashboard card. Order and visibility come from the appearance settings. */
export const DASHBOARD_CARDS: Partial<Record<CardId, CardDef>> = {
  greeting: { title: 'cards.greeting', Component: Greeting, span: 'full' },
  month: { title: 'cards.month', Component: MonthCard, span: 'full' },
  stats: { title: 'cards.stats', Component: StatsStrip, span: 'full' },
  upcoming: { title: 'cards.upcoming', Component: UpcomingCard, span: 'main' },
  quickAdd: { title: 'cards.quickAdd', Component: QuickAdd, span: 'side' },
  week: { title: 'cards.week', Component: WeekStrip, span: 'side' },
  distribution: { title: 'cards.distribution', Component: Distribution, span: 'side' },
  activity: { title: 'cards.activity', Component: Activity, span: 'side' },
  allSubscriptions: { title: 'cards.allSubscriptions', Component: AllSubscriptions, span: 'main' },
};
