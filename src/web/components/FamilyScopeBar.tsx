import { Users } from 'lucide-react';
import { t } from '../i18n';
import { cn } from '../lib/cn';
import { useFamilyScope } from '../lib/familyScope';
import { useFamily } from '../lib/hooks';
import { formatMemberLabel } from '../lib/memberLabel';
import { Select } from './ui/Select';

const ALL = 'all';

export function FamilyScopeBar({ className }: { className?: string }) {
  const family = useFamily().data;
  const { scope, memberId, setScope, setMemberId } = useFamilyScope();
  if (!family?.household) return null;

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)} data-testid="family-scope-bar">
      <div className="inline-flex h-9 items-center gap-1 rounded-ctl border border-line bg-sunk p-1" role="group" aria-label={t('family.scope.label')}>
        <button
          type="button"
          onClick={() => setScope('mine')}
          aria-pressed={scope === 'mine'}
          className={cn(
            'rounded-[max(0px,calc(var(--radius-sm)-2px))] px-3 py-1 text-[13px] font-medium transition-colors',
            scope === 'mine' ? 'bg-card text-text shadow-xs' : 'text-text-2 hover:text-text',
          )}
        >
          {t('family.scope.mine')}
        </button>
        <button
          type="button"
          onClick={() => setScope('family')}
          aria-pressed={scope === 'family'}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-[max(0px,calc(var(--radius-sm)-2px))] px-3 py-1 text-[13px] font-medium transition-colors',
            scope === 'family' ? 'bg-card text-text shadow-xs' : 'text-text-2 hover:text-text',
          )}
        >
          <Users className="size-3.5" aria-hidden />
          {t('family.scope.family')}
        </button>
      </div>
      {scope === 'family' && family.members.length > 0 && (
        <Select
          aria-label={t('family.memberFilter')}
          className="h-9 w-auto"
          value={memberId !== null ? String(memberId) : ALL}
          onChange={(v) => setMemberId(v === ALL ? null : Number(v))}
          options={[
            { value: ALL, label: t('family.allMembers') },
            ...family.members.map((m) => ({ value: String(m.id), label: formatMemberLabel(m) })),
          ]}
        />
      )}
    </div>
  );
}
