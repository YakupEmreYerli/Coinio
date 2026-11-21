import { DEFAULT_NOTIFY_SETTINGS, mergeNotifySettings, NotifySettings, TemplateText, type NotifyType, type TemplateSet } from '../../../shared/notify/types.js';
import { defaultTemplates } from '../../../shared/notify/defaults.js';
import type { Locale } from '../../../shared/locales.js';
import type { ServiceCtx } from '../context.js';
import { getUserValue, setUserValue } from '../settings.js';

function readJson(ctx: ServiceCtx, userId: number, key: 'notify' | 'notifyTemplates'): unknown {
  const raw = getUserValue(ctx, userId, key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getNotifySettings(ctx: ServiceCtx, userId: number): NotifySettings {
  const stored = readJson(ctx, userId, 'notify');
  return stored ? mergeNotifySettings(stored) : DEFAULT_NOTIFY_SETTINGS;
}

export function saveNotifySettings(ctx: ServiceCtx, userId: number, input: unknown): NotifySettings {
  const parsed = NotifySettings.parse(input);
  setUserValue(ctx, userId, 'notify', JSON.stringify(parsed));
  return parsed;
}

/** Only the templates the user changed; the rest follow the defaults of the current language. */
export function getTemplateOverrides(ctx: ServiceCtx, userId: number): Partial<TemplateSet> {
  const stored = readJson(ctx, userId, 'notifyTemplates');
  const out: Partial<TemplateSet> = {};
  if (stored && typeof stored === 'object') {
    for (const [type, value] of Object.entries(stored)) {
      const parsed = TemplateText.safeParse(value);
      if (parsed.success) out[type as NotifyType] = parsed.data;
    }
  }
  return out;
}

export function effectiveTemplates(ctx: ServiceCtx, userId: number, locale: Locale): TemplateSet {
  return { ...defaultTemplates(locale), ...getTemplateOverrides(ctx, userId) };
}

export function saveTemplate(ctx: ServiceCtx, userId: number, type: NotifyType, input: unknown): TemplateText {
  const parsed = TemplateText.parse(input);
  setUserValue(ctx, userId, 'notifyTemplates', JSON.stringify({ ...getTemplateOverrides(ctx, userId), [type]: parsed }));
  return parsed;
}

export function resetTemplate(ctx: ServiceCtx, userId: number, type: NotifyType): void {
  const { [type]: _dropped, ...rest } = getTemplateOverrides(ctx, userId);
  setUserValue(ctx, userId, 'notifyTemplates', JSON.stringify(rest));
}
