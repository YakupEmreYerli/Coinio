import { Fragment, type ReactNode } from 'react';
import { CardFrame } from '../dashboard/CardFrame';
import { HtmlCard } from '../dashboard/cards/HtmlCard';
import { SampleBanner } from './Welcome';
import { DASHBOARD_CARDS } from '../dashboard/registry';
import { t } from '../i18n';
import { useAppearanceEditor } from '../lib/appearanceEditor';
import type { CardId } from '../lib/types';

type Placed = { id: string; span: 'full' | 'main' | 'side'; node: ReactNode };

/**
 * Cards in the user's order: full-width ones stack; between them, "main" and "side" cards
 * flow into two columns (one column on phones). Custom HTML cards go in the main column.
 */
export function Dashboard() {
  const { appearance, update } = useAppearanceEditor();
  const shown: (Omit<Placed, 'node'> & { title: string; content: ReactNode })[] = [];
  for (const c of appearance.cards) {
    if (!c.visible) continue;
    if (c.id.startsWith('html:')) {
      const card = appearance.htmlCards.find((h) => `html:${h.id}` === c.id);
      if (card) shown.push({ id: c.id, span: 'main', title: card.title || t('look.htmlUntitled'), content: <HtmlCard card={card} /> });
      continue;
    }
    const def = DASHBOARD_CARDS[c.id as CardId];
    if (def) shown.push({ id: c.id, span: def.span, title: t(def.title), content: <def.Component /> });
  }
  const visible: Placed[] = shown.map((c, i) => ({
    id: c.id,
    span: c.span,
    node: (
      <CardFrame id={c.id} title={c.title} first={i === 0} last={i === shown.length - 1} update={update}>
        {c.content}
      </CardFrame>
    ),
  }));

  const blocks: { full?: Placed; main: Placed[]; side: Placed[] }[] = [];
  for (const c of visible) {
    if (c.span === 'full') blocks.push({ full: c, main: [], side: [] });
    else {
      let last = blocks[blocks.length - 1];
      if (!last || last.full) blocks.push((last = { main: [], side: [] }));
      last[c.span].push(c);
    }
  }
  const column = (items: Placed[]) => (
    <div className="flex min-w-0 flex-col gap-[var(--gap)]">
      {items.map((c) => (
        <Fragment key={c.id}>{c.node}</Fragment>
      ))}
    </div>
  );
  return (
    <div className="flex flex-col gap-[var(--gap)] px-4 pt-2 pb-12 md:px-9">
      <SampleBanner />
      {blocks.map((b, i) =>
        b.full ? (
          <Fragment key={b.full.id}>{b.full.node}</Fragment>
        ) : (
          <div key={i} className={b.side.length ? 'grid items-start gap-[var(--gap)] lg:grid-cols-[minmax(0,1fr)_360px]' : 'flex flex-col gap-[var(--gap)]'}>
            {b.main.length > 0 && column(b.main)}
            {b.side.length > 0 && column(b.side)}
          </div>
        ),
      )}
    </div>
  );
}
