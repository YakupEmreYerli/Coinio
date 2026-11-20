import { ArrowDown, ArrowUp, EyeOff, MoreHorizontal, Pencil } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { CardMenuSpace } from '../components/ui/Card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../components/ui/DropdownMenu';
import { toast } from '../components/ui/Toaster';
import { t } from '../i18n';
import type { Appearance } from '../lib/types';

type Update = (change: (a: Appearance) => Appearance) => void;

/** Moves a card past its visible neighbour in the given direction; hidden cards in between stay put. */
export function moveCard(a: Appearance, id: string, dir: -1 | 1): Appearance {
  const cards = [...a.cards];
  const from = cards.findIndex((c) => c.id === id);
  let to = from + dir;
  while (to >= 0 && to < cards.length && !cards[to]!.visible) to += dir;
  if (from < 0 || to < 0 || to >= cards.length) return a;
  const [card] = cards.splice(from, 1);
  cards.splice(to, 0, card!);
  return { ...a, cards };
}

export const setCardVisible = (a: Appearance, id: string, visible: boolean): Appearance => ({ ...a, cards: a.cards.map((c) => (c.id === id ? { ...c, visible } : c)) });

/**
 * A dashboard card with its "more" menu (move, hide, edit) and its own error boundary, so one
 * broken card shows a small notice while the rest of the dashboard keeps working.
 */
export function CardFrame({ id, title, first, last, update, children }: { id: string; title: string; first: boolean; last: boolean; update: Update; children: ReactNode }) {
  const navigate = useNavigate();
  const htmlId = id.startsWith('html:') ? id.slice(5) : null;
  const hide = () => {
    update((a) => setCardVisible(a, id, false));
    toast.undo(t('cardMenu.hidden', { name: title }), () => update((a) => setCardVisible(a, id, true)), t('common.undo'));
  };
  return (
    <div className="group/card relative min-w-0">
      <CardMenuSpace value={true}>
        <ErrorBoundary variant="card">{children}</ErrorBoundary>
      </CardMenuSpace>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={t('cardMenu.label', { name: title })}
          className="absolute top-3 right-3 grid size-8 place-items-center rounded-ctl text-text-3 opacity-0 transition-opacity outline-none group-hover/card:opacity-100 group-focus-within/card:opacity-100 hover:bg-sunk hover:text-text focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent data-[state=open]:bg-sunk data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100"
        >
          <MoreHorizontal className="size-4" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem disabled={first} onSelect={() => update((a) => moveCard(a, id, -1))}>
            <ArrowUp />
            {t('cardMenu.up')}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={last} onSelect={() => update((a) => moveCard(a, id, 1))}>
            <ArrowDown />
            {t('cardMenu.down')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={hide}>
            <EyeOff />
            {t('cardMenu.hide')}
          </DropdownMenuItem>
          {htmlId && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => navigate(`/settings/appearance?editCard=${encodeURIComponent(htmlId)}`)}>
                <Pencil />
                {t('cardMenu.edit')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
