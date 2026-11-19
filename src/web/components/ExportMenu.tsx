import { Download } from 'lucide-react';
import { DropdownMenu as M } from 'radix-ui';
import { Button } from './ui/Button';
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from './ui/DropdownMenu';
import { DEMO } from '../demo/flag';
import { t } from '../i18n';

const link = (what: 'subscriptions' | 'payments', format: 'csv' | 'json') => `/api/export?format=${format}&what=${what}`;

/** Download subscriptions or payments as CSV / JSON. */
export function ExportMenu({ compact }: { compact?: boolean }) {
  return (
    <M.Root>
      <M.Trigger asChild>
        <Button variant="secondary" aria-label={t('export.title')} className={compact ? 'w-[38px] justify-center px-0' : undefined}>
          <Download />
          {!compact && <span>{t('export.title')}</span>}
        </Button>
      </M.Trigger>
      <DropdownMenuContent>
        {DEMO ? (
          <p className="max-w-60 px-2 py-1.5 text-[13px] text-text-2">{t('demo.locked')}</p>
        ) : (['subscriptions', 'payments'] as const).map((what, i) => (
          <div key={what}>
            {i > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel>{t(`export.${what}`)}</DropdownMenuLabel>
            {(['csv', 'json'] as const).map((f) => (
              <DropdownMenuItem key={f} asChild>
                <a href={link(what, f)} download>
                  {f.toUpperCase()}
                </a>
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </M.Root>
  );
}
