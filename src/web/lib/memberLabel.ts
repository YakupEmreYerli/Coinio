import type { FamilyRelation } from '../../shared/types';
import { t } from '../i18n';

export const FAMILY_RELATIONS: readonly FamilyRelation[] = ['mother', 'father', 'partner', 'child', 'sibling', 'other'];

export function formatMemberLabel(m: { name: string; relation?: string | null }): string {
  if (!m.relation) return m.name;
  return `${m.name} (${t(`family.relation.${m.relation}`)})`;
}

export function relationOptions(): { value: string; label: string }[] {
  return [
    { value: '', label: t('family.relation.none') },
    ...FAMILY_RELATIONS.map((r) => ({ value: r, label: t(`family.relation.${r}`) })),
  ];
}
