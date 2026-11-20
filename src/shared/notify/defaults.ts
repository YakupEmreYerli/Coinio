import type { Locale } from '../locales';
import de from './defaults/de.json';
import en from './defaults/en.json';
import es from './defaults/es.json';
import fr from './defaults/fr.json';
import ja from './defaults/ja.json';
import ptBR from './defaults/pt-BR.json';
import tr from './defaults/tr.json';
import zhCN from './defaults/zh-CN.json';
import type { TemplateSet } from './types';

const DEFAULTS: Record<Locale, TemplateSet> = { en, tr, de, fr, es, 'pt-BR': ptBR, 'zh-CN': zhCN, ja };

/** The built-in templates, written in each language (not translated at runtime). */
export function defaultTemplates(locale: Locale): TemplateSet {
  return DEFAULTS[locale] ?? DEFAULTS.en;
}
