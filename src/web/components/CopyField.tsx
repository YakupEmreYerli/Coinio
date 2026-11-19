import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { t } from '../i18n';

/** Read-only monospace value with a copy button. */
export function CopyField({ value, label }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-stretch overflow-hidden rounded-ctl border border-line-2 bg-sunk">
      <code aria-label={label} className="num min-w-0 flex-1 overflow-x-auto px-3 py-2.5 text-[12.5px] whitespace-pre text-text">
        {value}
      </code>
      <button
        type="button"
        aria-label={t('common.copy')}
        className="grid w-10 shrink-0 place-items-center border-l border-line-2 text-text-3 hover:bg-card hover:text-text"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          } catch {
            // clipboard blocked: the text can still be selected by hand
          }
        }}
      >
        {done ? <Check className="size-4 text-pos" /> : <Copy className="size-4" />}
      </button>
    </div>
  );
}
