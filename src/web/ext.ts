// Extension points for custom builds. The stock build leaves every field empty; a custom build points the
// `@coinio/ext` import at its own module (a Vite and TypeScript alias) to add screens without editing these files.
import type { ComponentType } from 'react';
import type { Catalog } from './i18n';
import type { Locale } from '../shared/locales';
import type { SettingsSection } from './routes/settings/sections';

export type WebExt = {
  /** Rendered under the sign-in form (extra sign-in buttons, links). */
  SignInExtras?: ComponentType;
  /** Replaces the first-run setup screen. */
  SetupScreen?: ComponentType;
  /** Extra pages for signed-out visitors: path → component. */
  publicRoutes?: { path: string; Component: ComponentType }[];
  /** Extra pages inside the signed-in app: path → component. */
  routes?: { path: string; Component: ComponentType }[];
  /** Settings pages; one with the id of a built-in page replaces it in place, others are added at the end. */
  settingsSections?: SettingsSection[];
  /** Messages for the screens above, by language. */
  messages?: Partial<Record<Locale, Catalog>>;
};

export const ext: WebExt = {};
