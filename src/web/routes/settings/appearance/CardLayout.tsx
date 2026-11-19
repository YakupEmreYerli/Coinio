import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import { Switch as S } from 'radix-ui';
import { Button } from '../../../components/ui/Button';
import { DASHBOARD_CARDS } from '../../../dashboard/registry';
import { t } from '../../../i18n';
import type { Appearance, CardId } from '../../../lib/types';

type Entry = Appearance['cards'][number];

function title(e: Entry, a: Appearance): string {
  if (e.id.startsWith('html:')) return a.htmlCards.find((h) => `html:${h.id}` === e.id)?.title || t('look.htmlUntitled');
  return t(DASHBOARD_CARDS[e.id as CardId]?.title ?? e.id);
}

function Row({ entry, label, index, count, move, toggle }: { entry: Entry; label: string; index: number; count: number; move: (from: number, to: number) => void; toggle: (v: boolean) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.id });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`flex items-center gap-2 border-b border-line bg-card px-2 py-2 last:border-b-0 ${isDragging ? 'relative z-10 shadow-[var(--shadow)]' : ''}`}>
      <button type="button" aria-label={t('look.drag', { name: label })} className="grid size-8 cursor-grab place-items-center rounded-[6px] text-text-3 hover:bg-sunk active:cursor-grabbing" {...attributes} {...listeners}>
        <GripVertical className="size-4" />
      </button>
      <span className={`min-w-0 flex-1 truncate text-sm ${entry.visible ? '' : 'text-text-3'}`}>{label}</span>
      <Button size="icon-sm" variant="ghost" aria-label={t('look.moveUp', { name: label })} disabled={index === 0} onClick={() => move(index, index - 1)}>
        <ArrowUp />
      </Button>
      <Button size="icon-sm" variant="ghost" aria-label={t('look.moveDown', { name: label })} disabled={index === count - 1} onClick={() => move(index, index + 1)}>
        <ArrowDown />
      </Button>
      <S.Root aria-label={label} checked={entry.visible} onCheckedChange={toggle} className="relative ml-1 h-6 w-10 shrink-0 rounded-full bg-line-2 transition-colors data-[state=checked]:bg-accent">
        <S.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
      </S.Root>
    </li>
  );
}

/** Dashboard cards: drag (mouse, touch, keyboard) or use the arrows to reorder; switches show or hide. */
export function CardLayout({ appearance, onChange }: { appearance: Appearance; onChange: (cards: Entry[]) => void }) {
  const cards = appearance.cards;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const move = (from: number, to: number) => onChange(arrayMove(cards, from, to));
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    move(cards.findIndex((c) => c.id === e.active.id), cards.findIndex((c) => c.id === e.over!.id));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <ul className="overflow-hidden rounded-ctl border border-line">
          {cards.map((c, i) => (
            <Row key={c.id} entry={c} label={title(c, appearance)} index={i} count={cards.length} move={move} toggle={(v) => onChange(cards.map((x) => (x.id === c.id ? { ...x, visible: v } : x)))} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
