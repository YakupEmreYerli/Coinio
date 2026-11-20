import { describe, expect, it } from 'vitest';
import { LOCALES } from '../locales';
import { defaultTemplates } from './defaults';
import { renderTemplate, templateError, usedVariables } from './template';
import { NOTIFY_TYPES, TEMPLATE_VARIABLES } from './types';
import { sampleVars, type VarFormat } from './vars';

describe.each(LOCALES)('default templates (%s)', (locale) => {
  const set = defaultTemplates(locale);
  const f: VarFormat = { locale, money: (m, c) => `${c} ${(m / 100).toFixed(2)}`, cycle: () => 'monthly' };

  it.each(NOTIFY_TYPES)('%s is well formed and uses only offered variables', (type) => {
    const { title, body } = set[type];
    expect(templateError(title)).toBeNull();
    expect(templateError(body)).toBeNull();
    for (const v of [...usedVariables(title), ...usedVariables(body)]) expect(TEMPLATE_VARIABLES[type], `${type}: ${v}`).toContain(v);
    const out = renderTemplate(body, sampleVars(type, { today: '2026-11-20', base: 'EUR', appUrl: 'https://coinio.test' }, f), 'text');
    expect(out).not.toMatch(/\{\{|\}\}/);
    expect(out.trim().length).toBeGreaterThan(10);
  });

  if (locale !== 'en') {
    it('is written in its own language', () => {
      expect(set.reminder.body).not.toBe(defaultTemplates('en').reminder.body);
    });
  }
});
