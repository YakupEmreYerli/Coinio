import { CopyField } from '../../components/CopyField';
import { t } from '../../i18n';
import { Section } from './Section';

export function Connections() {
  const origin = typeof location === 'undefined' ? 'https://example.com' : location.origin;
  const mcp = `${origin}/mcp`;
  return (
    <div className="flex flex-col gap-[var(--gap)]">
      <Section title={t('conn.mcpTitle')} description={t('conn.mcpDesc')}>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-text-2">{t('conn.address')}</span>
          <CopyField value={mcp} />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-text-2">Claude.ai · Claude iPhone/Android</span>
          <p className="text-[13px] text-text-2">{t('conn.claudeAi')}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-text-2">Claude Code</span>
          <CopyField value={`claude mcp add --transport http coinio ${mcp} --header "Authorization: Bearer <${t('conn.yourKey')}>"`} />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-text-2">Cursor · Claude Desktop (mcp.json)</span>
          <CopyField value={JSON.stringify({ mcpServers: { coinio: { url: mcp, headers: { Authorization: `Bearer <${t('conn.yourKey')}>` } } } }, null, 2)} />
        </div>
        <p className="text-xs text-text-3">{t('conn.keyHint')}</p>
      </Section>
      <Section title={t('conn.widgetTitle')} description={t('conn.widgetDesc')}>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-text-2">{t('conn.widgetEndpoint')}</span>
          <CopyField value={`${origin}/api/widget`} />
        </div>
      </Section>
    </div>
  );
}
