import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { HtmlCard } from '../../../../shared/appearance';
import { Button } from '../../../components/ui/Button';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '../../../components/ui/Dialog';
import { Input } from '../../../components/ui/Input';
import { Textarea } from '../../../components/ui/Textarea';
import { t } from '../../../i18n';
import type { Appearance } from '../../../lib/types';

type Update = (change: Partial<Appearance> | ((a: Appearance) => Appearance)) => void;

/** Add, edit and remove the user's own HTML cards shown on the dashboard. */
export function HtmlCards({ appearance, update }: { appearance: Appearance; update: Update }) {
  const [editing, setEditing] = useState<HtmlCard | null>(null);
  const [isNew, setIsNew] = useState(false);
  const save = (card: HtmlCard) => {
    update((a) =>
      isNew
        ? { ...a, htmlCards: [...a.htmlCards, card], cards: [...a.cards, { id: `html:${card.id}`, visible: true }] }
        : { ...a, htmlCards: a.htmlCards.map((c) => (c.id === card.id ? card : c)) },
    );
    setEditing(null);
  };
  const remove = (id: string) => update((a) => ({ ...a, htmlCards: a.htmlCards.filter((c) => c.id !== id), cards: a.cards.filter((c) => c.id !== `html:${id}`) }));
  return (
    <>
      {appearance.htmlCards.length > 0 && (
        <ul className="overflow-hidden rounded-ctl border border-line">
          {appearance.htmlCards.map((c) => (
            <li key={c.id} className="flex items-center gap-2 border-b border-line px-3 py-2 last:border-b-0">
              <span className="min-w-0 flex-1 truncate text-sm">{c.title || t('look.htmlUntitled')}</span>
              <Button size="icon-sm" variant="ghost" aria-label={t('upcoming.edit')} onClick={() => (setIsNew(false), setEditing(c))}>
                <Pencil />
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label={t('common.delete')} onClick={() => remove(c.id)}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button
        className="self-start"
        disabled={appearance.htmlCards.length >= 20}
        onClick={() => {
          setIsNew(true);
          setEditing({ id: `c${Date.now().toString(36)}`, title: '', html: '', height: 240 });
        }}
      >
        <Plus />
        {t('look.htmlAdd')}
      </Button>
      <p className="text-xs text-text-3">{t('look.htmlSafety')}</p>
      <HtmlCardDialog card={editing} onClose={() => setEditing(null)} onSave={save} />
    </>
  );
}

function HtmlCardDialog({ card, onClose, onSave }: { card: HtmlCard | null; onClose: () => void; onSave: (c: HtmlCard) => void }) {
  const [draft, setDraft] = useState<HtmlCard | null>(card);
  if (card && draft?.id !== card.id) setDraft(card);
  return (
    <Dialog open={!!card} onOpenChange={(v) => !v && onClose()}>
      <DialogContent title={t('look.htmlCard')} size="lg">
        {draft && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSave(draft);
            }}
          >
            <DialogBody>
              <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
                <Input label={t('look.htmlTitle')} value={draft.title} maxLength={80} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                <Input label={t('look.htmlHeight')} type="number" min={80} max={1200} value={draft.height} onChange={(e) => setDraft({ ...draft, height: Math.max(80, Math.min(1200, Number(e.target.value) || 80)) })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="html-src" className="text-[13px] font-medium text-text-2">
                  HTML
                </label>
                <Textarea id="html-src" spellCheck={false} rows={10} maxLength={50_000} className="num text-[12.5px]" value={draft.html} onChange={(e) => setDraft({ ...draft, html: e.target.value })} placeholder="<div style=&quot;font: 14px system-ui&quot;>…</div>" />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium text-text-2">{t('look.preview')}</span>
                <iframe title={t('look.preview')} sandbox="allow-scripts" srcDoc={draft.html} className="w-full rounded-ctl border border-line bg-white" style={{ height: Math.min(draft.height, 320) }} />
              </div>
            </DialogBody>
            <DialogFooter>
              <Button onClick={onClose}>{t('common.cancel')}</Button>
              <Button type="submit" variant="primary">
                {t('common.save')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
