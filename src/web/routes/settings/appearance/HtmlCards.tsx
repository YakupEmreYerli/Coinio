import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { HtmlCard } from '../../../../shared/appearance';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { Button } from '../../../components/ui/Button';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '../../../components/ui/Dialog';
import { Input } from '../../../components/ui/Input';
import { Switch } from '../../../components/ui/Switch';
import { Textarea } from '../../../components/ui/Textarea';
import { CardDataBridge, cardDocument } from '../../../dashboard/cards/HtmlCard';
import { t } from '../../../i18n';
import type { Appearance } from '../../../lib/types';

type Update = (change: Partial<Appearance> | ((a: Appearance) => Appearance)) => void;

/**
 * A new card goes right below the greeting (or first, when the greeting is not in the list), so it
 * shows up at the top of the dashboard instead of out of sight at the bottom.
 */
export function insertNewCard(a: Appearance, card: HtmlCard): Appearance {
  const at = a.cards.findIndex((c) => c.id === 'greeting') + 1;
  const cards = [...a.cards];
  cards.splice(at, 0, { id: `html:${card.id}`, visible: true });
  return { ...a, htmlCards: [...a.htmlCards, card], cards };
}

/** Add, edit and remove the user's own HTML cards shown on the dashboard. */
export function HtmlCards({ appearance, update }: { appearance: Appearance; update: Update }) {
  const [editing, setEditing] = useState<HtmlCard | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [removing, setRemoving] = useState<HtmlCard | null>(null);
  const [params, setParams] = useSearchParams();
  const section = useRef<HTMLButtonElement>(null);
  // The dashboard card menu's "Edit" links here with ?editCard=<id>.
  const editId = params.get('editCard');
  useEffect(() => {
    if (!editId) return;
    const card = appearance.htmlCards.find((c) => c.id === editId);
    if (card) {
      section.current?.scrollIntoView({ block: 'center' });
      setIsNew(false);
      setEditing(card);
    }
    setParams((p) => (p.delete('editCard'), p), { replace: true });
  }, [editId, appearance.htmlCards, setParams]);
  const save = (card: HtmlCard) => {
    update((a) => (isNew ? insertNewCard(a, card) : { ...a, htmlCards: a.htmlCards.map((c) => (c.id === card.id ? card : c)) }));
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
              <Button size="icon-sm" variant="ghost" aria-label={t('common.delete')} onClick={() => setRemoving(c)}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button
        ref={section}
        className="self-start"
        disabled={appearance.htmlCards.length >= 20}
        onClick={() => {
          setIsNew(true);
          setEditing({ id: `c${Date.now().toString(36)}`, title: '', html: '', height: 240, shareData: false });
        }}
      >
        <Plus />
        {t('look.htmlAdd')}
      </Button>
      <p className="text-xs text-text-3">{t('look.htmlSafety')}</p>
      <HtmlCardDialog appearance={appearance} card={editing} onClose={() => setEditing(null)} onSave={save} />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(v) => !v && setRemoving(null)}
        title={t('look.htmlDeleteTitle', { name: removing?.title || t('look.htmlUntitled') })}
        body={t('look.htmlDeleteBody')}
        confirmLabel={t('common.delete')}
        onConfirm={() => removing && remove(removing.id)}
      />
    </>
  );
}

function HtmlCardDialog({ appearance, card, onClose, onSave }: { appearance: Appearance; card: HtmlCard | null; onClose: () => void; onSave: (c: HtmlCard) => void }) {
  const [draft, setDraft] = useState<HtmlCard | null>(card);
  const [askShare, setAskShare] = useState(false);
  const preview = useRef<HTMLIFrameElement>(null);
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
                <iframe key={String(draft.shareData)} ref={preview} title={t('look.preview')} sandbox="allow-scripts" srcDoc={cardDocument(draft.html, appearance)} className="w-full rounded-ctl border border-line" style={{ height: Math.min(draft.height, 320) }} />
                {draft.shareData && <CardDataBridge frame={preview} />}
              </div>
              <Switch
                checked={draft.shareData}
                onChange={(v) => (v ? setAskShare(true) : setDraft({ ...draft, shareData: false }))}
                label={t('look.htmlShare')}
                description={t('look.htmlShareDesc')}
              />
            </DialogBody>
            <DialogFooter>
              <Button onClick={onClose}>{t('common.cancel')}</Button>
              <Button type="submit" variant="primary">
                {t('common.save')}
              </Button>
            </DialogFooter>
          </form>
        )}
        <ConfirmDialog
          open={askShare}
          onOpenChange={setAskShare}
          title={t('look.htmlShareTitle')}
          body={t('look.htmlShareWarning')}
          confirmLabel={t('look.htmlShareConfirm')}
          onConfirm={() => draft && setDraft({ ...draft, shareData: true })}
        />
      </DialogContent>
    </Dialog>
  );
}
