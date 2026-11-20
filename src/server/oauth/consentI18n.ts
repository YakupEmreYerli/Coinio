import { translate, type Locale } from '../i18n/index.js';

export type ConsentLocale = Locale;
export { localeFromAcceptLanguage } from '../i18n/index.js';

/**
 * The sign-in and consent page strings in one language. Variables (client name, username, host) must be
 * escaped before they go in, since some templates hold markup (<strong>).
 */
export const consentStrings = (locale: Locale) => (key: string, vars?: Record<string, string>) => translate(locale, `consent.${key}`, vars);
