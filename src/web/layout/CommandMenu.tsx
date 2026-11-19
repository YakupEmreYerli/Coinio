import { Command } from 'cmdk';
import { Dialog as D } from 'radix-ui';
import { Check, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { t } from '../i18n';
import { usePay, useSubscriptions } from '../lib/hooks';
import { NAV_BOTTOM, NAV_ITEMS } from './nav';
import { useSubscriptionForm } from './subscriptionForm';

const itemClass =
  'flex h-10 cursor-default items-center gap-3 rounded-[8px] px-3 text-sm outline-none select-none data-[selected=true]:bg-sunk [&_svg]:size-4 [&_svg]:text-text-3';
const groupClass = '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-text-3';

export function CommandMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  const form = useSubscriptionForm();
  const subs = (useSubscriptions().data ?? []).filter((s) => s.active);
  const pay = usePay();
  const run = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-[var(--overlay)]" />
        <D.Content className="fixed top-[12vh] left-1/2 z-50 w-[calc(100vw-24px)] max-w-[580px] -translate-x-1/2 overflow-hidden rounded-card border border-line bg-card text-text shadow-[var(--shadow)]">
          <D.Title className="sr-only">{t('top.search')}</D.Title>
          <D.Description className="sr-only">{t('cmd.placeholder')}</D.Description>
          <Command label={t('top.search')}>
            <Command.Input placeholder={t('cmd.placeholder')} className="h-[52px] w-full border-b border-line bg-transparent px-4 text-[15px] outline-none placeholder:text-text-3" />
            <Command.List className="max-h-[min(60vh,420px)] overflow-y-auto p-1.5">
              <Command.Empty className="px-3 py-6 text-center text-sm text-text-3">{t('cmd.empty')}</Command.Empty>
              <Command.Group heading={t('cmd.actions')} className={groupClass}>
                <Command.Item className={itemClass} onSelect={() => run(() => form.openCreate())}>
                  <Plus />
                  {t('top.add')}
                </Command.Item>
                {subs
                  .filter((s) => !s.autoPay)
                  .map((s) => (
                    <Command.Item key={`pay-${s.id}`} value={`pay ${s.name}`} className={itemClass} onSelect={() => run(() => pay.mutate({ id: s.id, name: s.name }))}>
                      <Check />
                      {t('cmd.pay', { name: s.name })}
                    </Command.Item>
                  ))}
              </Command.Group>
              <Command.Group heading={t('cmd.pages')} className={groupClass}>
                {[...NAV_ITEMS, ...NAV_BOTTOM].map((item) => {
                  const Icon = item.icon;
                  return (
                    <Command.Item key={item.to} value={t(item.label)} className={itemClass} onSelect={() => run(() => navigate(item.to))}>
                      <Icon />
                      {t(item.label)}
                    </Command.Item>
                  );
                })}
              </Command.Group>
              {subs.length > 0 && (
                <Command.Group heading={t('nav.subscriptions')} className={groupClass}>
                  {subs.map((s) => (
                    <Command.Item key={s.id} value={`${s.name} ${s.domain ?? ''}`} className={itemClass} onSelect={() => run(() => navigate(`/subscriptions/${s.id}`))}>
                      <Logo sub={s} size={22} />
                      {s.name}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
