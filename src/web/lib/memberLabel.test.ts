import { beforeEach, describe, expect, it } from 'vitest';
import { setLocale } from '../i18n';
import { formatMemberLabel } from './memberLabel';

beforeEach(() => setLocale('tr'));

describe('formatMemberLabel', () => {
  it('returns plain name when no relation is set', () => {
    expect(formatMemberLabel({ name: 'Tuncay', relation: null }, 'child')).toBe('Tuncay');
  });

  it('uses possessive roles relative to a child viewer', () => {
    expect(formatMemberLabel({ name: 'Tuncay', relation: 'father' }, 'child')).toBe('Tuncay (Babam)');
    expect(formatMemberLabel({ name: 'Ayşe', relation: 'mother' }, 'child')).toBe('Ayşe (Annem)');
    expect(formatMemberLabel({ name: 'Elif', relation: 'child' }, 'child')).toBe('Elif (Kardeşim)');
    expect(formatMemberLabel({ name: 'Yakup', relation: 'child', isMe: true }, 'child')).toBe('Yakup (Çocuk)');
  });

  it('uses spouse/child possessive roles relative to parents', () => {
    expect(formatMemberLabel({ name: 'Ayşe', relation: 'mother' }, 'father')).toBe('Ayşe (Eşim)');
    expect(formatMemberLabel({ name: 'Yakup', relation: 'child' }, 'father')).toBe('Yakup (Çocuğum)');
    expect(formatMemberLabel({ name: 'Tuncay', relation: 'father', isMe: true }, 'father')).toBe('Tuncay (Baba)');
  });
});
