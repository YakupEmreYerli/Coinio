import type { FamilyRelation } from '../../shared/types';
import { t } from '../i18n';

export const FAMILY_RELATIONS: readonly FamilyRelation[] = ['mother', 'father', 'partner', 'child', 'sibling', 'other'];

export function resolveRelationKey(memberRelation: string, viewerRelation?: string | null, isSelf?: boolean): string {
  if (isSelf) return `family.relation.${memberRelation}`;
  switch (memberRelation) {
    case 'father':
      return viewerRelation === 'mother' ? 'family.relationPossessive.partner' : 'family.relationPossessive.father';
    case 'mother':
      return viewerRelation === 'father' ? 'family.relationPossessive.partner' : 'family.relationPossessive.mother';
    case 'partner':
      return 'family.relationPossessive.partner';
    case 'child':
      return viewerRelation === 'child' || viewerRelation === 'sibling'
        ? 'family.relationPossessive.sibling'
        : 'family.relationPossessive.child';
    case 'sibling':
      return 'family.relationPossessive.sibling';
    default:
      return `family.relation.${memberRelation}`;
  }
}

export function formatMemberLabel(
  m: { name: string; relation?: string | null; isMe?: boolean },
  viewerRelation?: string | null,
): string {
  if (!m.relation) return m.name;
  const key = resolveRelationKey(m.relation, viewerRelation, m.isMe);
  return `${m.name} (${t(key)})`;
}

export function relationOptions(): { value: string; label: string }[] {
  return [
    { value: '', label: t('family.relation.none') },
    ...FAMILY_RELATIONS.map((r) => ({ value: r, label: t(`family.relation.${r}`) })),
  ];
}
