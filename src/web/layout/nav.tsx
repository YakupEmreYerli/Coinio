import { BarChart3, CalendarDays, History, Home, List, Settings, type LucideIcon } from 'lucide-react';

export type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean; tab?: boolean };

/** Main menu; later pages add themselves here. `tab` items also appear in the phone tab bar. */
export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'nav.home', icon: Home, end: true, tab: true },
  { to: '/subscriptions', label: 'nav.subscriptions', icon: List, tab: true },
  { to: '/calendar', label: 'nav.calendar', icon: CalendarDays, tab: true },
  { to: '/payments', label: 'nav.payments', icon: History },
  { to: '/reports', label: 'nav.reports', icon: BarChart3 },
];

export const NAV_BOTTOM: NavItem[] = [
  { to: '/settings', label: 'nav.settings', icon: Settings, tab: true },
];
