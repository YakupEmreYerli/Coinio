import { ShieldCheck } from 'lucide-react';
import { Tabs as T } from 'radix-ui';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { CopyField } from '../../components/CopyField';
import { t } from '../../i18n';
import { ApiKeys } from './ApiKeys';
import { ConnectedApps } from './ConnectedApps';
import { Section } from './Section';
import { AndroidSetup } from './AndroidSetup';
import { WidgetSetup } from './WidgetSetup';

const PARTS = [
  { id: 'mcp', label: 'conn.nav.mcp' },
  { id: 'apps', label: 'settings.apps' },
  { id: 'keys', label: 'settings.keys' },
  { id: 'widget', label: 'conn.widgetTitle' },
  { id: 'android', label: 'conn.androidTitle' },
];

const tabClass =
  'h-8 rounded-[7px] px-3 text-[13px] font-medium whitespace-nowrap text-text-2 outline-none hover:text-text focus-visible:ring-2 focus-visible:ring-accent-soft data-[state=active]:bg-card data-[state=active]:text-text data-[state=active]:shadow-[0_0_0_1px_var(--line-2)]';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-text-2">{label}</span>
      {children}
    </div>
  );
}

const keyLink = (
  <a href="#keys" className="font-medium text-accent underline-offset-2 hover:underline">
    {t('conn.toKeys')}
  </a>
);

function Mcp({ origin }: { origin: string }) {
  const mcp = `${origin}/mcp`;
  const bearer = `Bearer <${t('conn.yourKey')}>`;
  return (
    <Section id="mcp" title={t('conn.mcpTitle')} description={t('conn.mcpDesc')}>
      <Field label={t('conn.address')}>
        <CopyField value={mcp} label={t('conn.address')} />
      </Field>
      <T.Root defaultValue="claude" className="flex flex-col gap-3">
        <T.List aria-label={t('conn.client')} className="flex max-w-full gap-0.5 self-start overflow-x-auto rounded-[9px] bg-sunk p-0.5">
          <T.Trigger value="claude" className={tabClass}>
            {t('conn.tab.claude')}
          </T.Trigger>
          <T.Trigger value="code" className={tabClass}>
            Claude Code
          </T.Trigger>
          <T.Trigger value="desktop" className={tabClass}>
            Cursor · Claude Desktop
          </T.Trigger>
        </T.List>
        <T.Content value="claude" className="flex flex-col gap-2 outline-none">
          <p className="inline-flex items-center gap-1.5 self-start rounded-[6px] bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
            <ShieldCheck className="size-3.5" />
            {t('conn.noKey')}
          </p>
          <p className="text-[13px] text-text-2">{t('conn.claudeAi')}</p>
        </T.Content>
        <T.Content value="code" className="flex flex-col gap-2 outline-none">
          <p className="text-[13px] text-text-2">{t('conn.codeHint')}</p>
          <CopyField value={`claude mcp add --transport http coinio ${mcp} --header "Authorization: ${bearer}"`} />
          <p className="text-xs text-text-3">
            {t('conn.keyHint')} {keyLink}
          </p>
        </T.Content>
        <T.Content value="desktop" className="flex flex-col gap-2 outline-none">
          <p className="text-[13px] text-text-2">{t('conn.desktopHint')}</p>
          <CopyField value={JSON.stringify({ mcpServers: { coinio: { url: mcp, headers: { Authorization: bearer } } } }, null, 2)} />
          <p className="text-xs text-text-3">
            {t('conn.keyHint')} {keyLink}
          </p>
        </T.Content>
      </T.Root>
    </Section>
  );
}

/** One place for everything that talks to Coinio from outside: AI assistants, signed-in apps, API keys, the widget. */
export function Integrations() {
  const origin = typeof location === 'undefined' ? 'https://example.com' : location.origin;
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView?.();
  }, [hash]);
  return (
    <div className="flex flex-col gap-[var(--gap)]">
      <nav aria-label={t('conn.onThisPage')} className="-mb-1 flex gap-1.5 overflow-x-auto">
        {PARTS.map((p) => (
          <a
            key={p.id}
            href={`#${p.id}`}
            className="shrink-0 rounded-full border border-line bg-card px-3 py-1 text-[13px] whitespace-nowrap text-text-2 outline-none hover:border-line-2 hover:text-text focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent-soft"
          >
            {t(p.label)}
          </a>
        ))}
      </nav>
      <Mcp origin={origin} />
      <ConnectedApps />
      <ApiKeys />
      <WidgetSetup origin={origin} />
      <AndroidSetup origin={origin} />
    </div>
  );
}
