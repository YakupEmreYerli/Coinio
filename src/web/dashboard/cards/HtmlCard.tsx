import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { Card, CardHeader } from '../../components/ui/Card';
import type { HtmlCard as HtmlCardData } from '../../../shared/appearance';
import { widgetPayload } from '../../../shared/widget';
import { t } from '../../i18n';
import { SAFE_MODE } from '../../lib/appearance';
import { useAppearanceValue } from '../../lib/appearanceContext';
import { useSummary } from '../../lib/hooks';
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
  const frame = useRef<HTMLIFrameElement>(null);
  return (
    <Card className="overflow-hidden">
      {card.title && <CardHeader title={card.title} />}
      {safe ? (
        <p className="px-5 py-4 text-[13px] text-text-3">{t('look.safeModeCard')}</p>
      ) : (
        <>
          {/* A new frame when permission changes, so data sent earlier does not linger after turning it off. */}
          <iframe key={String(card.shareData)} ref={frame} title={card.title || card.id} sandbox="allow-scripts" srcDoc={cardDocument(card.html, appearance)} className="block w-full border-0 bg-transparent" style={{ height: card.height }} />
          {card.shareData && <CardDataBridge frame={frame} />}
        </>
      )}
    </Card>
  );
}

/**
 * Sends a card the owner allowed to read their data a read-only summary in the `/api/widget` shape:
 * after the frame loads, whenever the data changes, and when the frame asks with
 * `{ type: 'coinio:request-data' }`. Render it only for cards with `shareData` on.
 */
export function CardDataBridge({ frame }: { frame: RefObject<HTMLIFrameElement | null> }) {
  const summary = useSummary().data;
  const payload = useMemo(() => (summary ? widgetPayload(summary, new Date()) : null), [summary]);
  useEffect(() => {
    const el = frame.current;
    if (!el || !payload) return;
    // Target origin has to be '*': a sandboxed srcdoc frame without allow-same-origin has an opaque
    // origin that no other value matches. Only this frame's own window receives it.
    const send = () => el.contentWindow?.postMessage({ type: 'coinio:data', version: 1, data: payload }, '*');
    const onMessage = (e: MessageEvent) => {
      if (e.source === el.contentWindow && (e.data as { type?: unknown } | null)?.type === 'coinio:request-data') send();
    };
    send();
    el.addEventListener('load', send);
    window.addEventListener('message', onMessage);
    return () => {
      el.removeEventListener('load', send);
      window.removeEventListener('message', onMessage);
    };
  }, [frame, payload]);
  return null;
}
