import { Languages, LogOut, Moon, Plus, Search, Sun, UserRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { api } from '../api';
import { DEMO } from '../demo/flag';
import { Button } from '../components/ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '../components/ui/DropdownMenu';
import { LOCALES, LOCALE_NAMES, isLocale, t, useLocale } from '../i18n';
import { useUpdateSettings } from '../lib/hooks';
import { useThemeToggle } from '../lib/themeToggle';
import { useSubscriptionForm } from './subscriptionForm';

export function TopBar({ username, onSearch, onLogout, extra }: { username: string; onSearch: () => void; onLogout: () => void; extra?: ReactNode }) {
  const form = useSubscriptionForm();
  const { locale } = useLocale();
  const saveSettings = useUpdateSettings();
  const theme = useThemeToggle();
  return (
    <header className="flex items-center gap-3 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-2 md:px-9 md:pt-4">
      <button
        type="button"
        onClick={onSearch}
        className="hidden h-10 max-w-[460px] flex-1 items-center gap-2.5 rounded-[10px] border border-line-2 bg-card px-3 text-sm text-text-3 md:flex"
      >
        <Search className="size-4" />
        {t('top.search')}
        <kbd className="ml-auto flex gap-1 text-[11px]">
          <span className="rounded border border-line-2 px-1.5">⌘</span>
          <span className="rounded border border-line-2 px-1.5">K</span>
        </kbd>
      </button>
      <Button variant="ghost" size="icon" className="md:hidden" aria-label={t('top.search')} onClick={onSearch}>
        <Search />
      </Button>
      <div className="flex-1" />
      {extra}
      <Button variant="primary" onClick={() => form.openCreate()} aria-label={t('top.add')} className="max-md:w-[38px] max-md:justify-center max-md:px-0">
        <Plus strokeWidth={2.2} />
        <span className="max-md:hidden">{t('top.add')}</span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={t('top.account')} className="grid size-9 shrink-0 place-items-center rounded-full bg-sunk font-semibold text-text-2 ring-1 ring-line">
            {username.slice(0, 1).toLocaleUpperCase('tr') || <UserRound className="size-4" />}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>{username}</DropdownMenuLabel>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Languages />
              {LOCALE_NAMES[locale]}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup value={locale} onValueChange={(v) => isLocale(v) && saveSettings.mutate({ locale: v })}>
                {LOCALES.map((l) => (
                  <DropdownMenuRadioItem key={l} value={l} lang={l}>
                    {LOCALE_NAMES[l]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem onSelect={theme.toggle}>
            {theme.dark ? <Sun /> : <Moon />}
            {theme.dark ? t('top.lightMode') : t('top.darkMode')}
          </DropdownMenuItem>
          {!DEMO && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={async () => {
                  await api.post('/auth/logout');
                  onLogout();
                }}
              >
                <LogOut />
                {t('common.logout')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
