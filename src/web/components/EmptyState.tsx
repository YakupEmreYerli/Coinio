import type { ReactNode } from 'react';

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      {icon && <div className="mb-1 grid size-10 place-items-center rounded-full bg-sunk text-text-3 [&_svg]:size-5">{icon}</div>}
      <p className="font-medium">{title}</p>
      {body && <p className="max-w-[320px] text-[13px] text-text-3">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
