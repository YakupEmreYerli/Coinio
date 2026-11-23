import { Bell, Blocks, Download, Palette, Settings2, UserRound, Users, type LucideIcon } from 'lucide-react';
import type { FC } from 'react';
import { ext } from '@coinio/ext';
import { Account } from './Account';
import { Appearance } from './Appearance';
import { FamilySettings } from './Family';
import { General } from './General';
import { Import } from './Import';
import { Integrations } from './Integrations';
import { Notifications } from './Notifications';

export type SettingsSection = { id: string; label: string; icon: LucideIcon; Component: FC };

/** Settings pages in menu order. */
const BUILT_IN: SettingsSection[] = [
  { id: 'general', label: 'settings.general', icon: Settings2, Component: General },
  { id: 'appearance', label: 'settings.appearance', icon: Palette, Component: Appearance },
  { id: 'family', label: 'settings.family', icon: Users, Component: FamilySettings },
  { id: 'notifications', label: 'settings.notifications', icon: Bell, Component: Notifications },
  { id: 'integrations', label: 'settings.integrations', icon: Blocks, Component: Integrations },
  { id: 'import', label: 'settings.import', icon: Download, Component: Import },
  { id: 'account', label: 'settings.account', icon: UserRound, Component: Account },
];

const added = ext.settingsSections ?? [];
export const SETTINGS_SECTIONS: SettingsSection[] = [
  ...BUILT_IN.map((s) => added.find((a) => a.id === s.id) ?? s),
  ...added.filter((a) => !BUILT_IN.some((s) => s.id === a.id)),
];

/** Former pages that now live as parts of Integrations; old links land on the right part. */
export const MOVED_SECTIONS: Record<string, string> = {
  keys: '/settings/integrations#keys',
  apps: '/settings/integrations#apps',
  connections: '/settings/integrations#mcp',
};
