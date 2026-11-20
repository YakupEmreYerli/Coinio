import type { ReactNode } from 'react';
import { Card } from '../../components/ui/Card';

/** A titled block inside a settings page; `id` makes it a link target (/settings/x#id). */
export function Section({ id, title, description, children, footer }: { id?: string; title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <Card id={id} className={id && 'scroll-mt-4'}>
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-[15px] font-medium">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-text-2">{description}</p>}
      </div>
      <div className="flex flex-col gap-4 px-5 py-5">{children}</div>
      {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
    </Card>
  );
}
