import { AppWindow, Bell, Download, KeyRound, Link2, Palette, Settings2, UserRound, type LucideIcon } from 'lucide-react';
import type { FC } from 'react';
import { Account } from './Account';
import { Appearance } from './Appearance';
import { ApiKeys } from './ApiKeys';
import { ConnectedApps } from './ConnectedApps';
import { Connections } from './Connections';
import { General } from './General';
import { Import } from './Import';
import { Notifications } from './Notifications';

export type SettingsSection = { id: string; label: string; icon: LucideIcon; Component: FC };

/** Settings pages in menu order; Appearance inserts itself after General. */
export const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: 'general', label: 'settings.general', icon: Settings2, Component: General },
  { id: 'appearance', label: 'settings.appearance', icon: Palette, Component: Appearance },
  { id: 'notifications', label: 'settings.notifications', icon: Bell, Component: Notifications },
  { id: 'keys', label: 'settings.keys', icon: KeyRound, Component: ApiKeys },
  { id: 'apps', label: 'settings.apps', icon: AppWindow, Component: ConnectedApps },
  { id: 'connections', label: 'settings.connections', icon: Link2, Component: Connections },
  { id: 'import', label: 'settings.import', icon: Download, Component: Import },
  { id: 'account', label: 'settings.account', icon: UserRound, Component: Account },
];
