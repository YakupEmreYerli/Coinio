import { Card, CardHeader } from '../../components/ui/Card';
import type { HtmlCard as HtmlCardData } from '../../../shared/appearance';
import { t } from '../../i18n';
import { SAFE_MODE } from '../../lib/appearance';
import { useAppearanceValue } from '../../lib/appearanceContext';
import type { Appearance } from '../../lib/types';

function isDark(a: Appearance): boolean {
  if (a.theme === 'system') return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  return a.theme === 'night' || a.theme === 'black';
}

/**
 * The card's document: a few base styles first (the user's own styles come later and win), so a card
 * follows the theme. A frame whose colour scheme differs from the page is painted opaque white, which
 * left a white slab on dark themes.
 */
export function cardDocument(html: string, a: Appearance): string {
  const scheme = isDark(a) ? 'dark' : 'light';
  return `<style>:root{color-scheme:${scheme};--accent:${a.accent}}html,body{background:transparent;font-family:system-ui,sans-serif}</style>${html}`;
}

/**
 * The user's own HTML in a sandboxed frame: scripts may run, but without allow-same-origin the
 * frame cannot read the app, its cookies or its data.
 */
export function HtmlCard({ card, safe = SAFE_MODE }: { card: HtmlCardData; safe?: boolean }) {
  const appearance = useAppearanceValue();
  return (
    <Card className="overflow-hidden">
      {card.title && <CardHeader title={card.title} />}
      {safe ? (
        <p className="px-5 py-4 text-[13px] text-text-3">{t('look.safeModeCard')}</p>
      ) : (
        <iframe title={card.title || card.id} sandbox="allow-scripts" srcDoc={cardDocument(card.html, appearance)} className="block w-full border-0 bg-transparent" style={{ height: card.height }} />
      )}
    </Card>
  );
}
