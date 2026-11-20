import { DEFAULT_NOTIFY_SETTINGS, mergeNotifySettings, NotifySettings, TemplateText, type NotifyType, type TemplateSet } from '../../../shared/notify/types.js';
import { defaultTemplates } from '../../../shared/notify/defaults.js';
import type { Locale } from '../../../shared/locales.js';
import type { ServiceCtx } from '../context.js';
import { getInternalValue, setInternalValue } from '../settings.js';

function readJson(ctx: ServiceCtx, key: 'notify' | 'notifyTemplates'): unknown {
  const raw = getInternalValue(ctx, key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getNotifySettings(ctx: ServiceCtx): NotifySettings {
  const stored = readJson(ctx, 'notify');
  return stored ? mergeNotifySettings(stored) : DEFAULT_NOTIFY_SETTINGS;
}

export function saveNotifySettings(ctx: ServiceCtx, input: unknown): NotifySettings {
  const parsed = NotifySettings.parse(input);
  setInternalValue(ctx, 'notify', JSON.stringify(parsed));
  return parsed;
}

/** Only the templates the user changed; the rest follow the defaults of the current language. */
export function getTemplateOverrides(ctx: ServiceCtx): Partial<TemplateSet> {
  const stored = readJson(ctx, 'notifyTemplates');
  const out: Partial<TemplateSet> = {};
  if (stored && typeof stored === 'object') {
    for (const [type, value] of Object.entries(stored)) {
      const parsed = TemplateText.safeParse(value);
      if (parsed.success) out[type as NotifyType] = parsed.data;
    }
  }
  return out;
}

export function effectiveTemplates(ctx: ServiceCtx, locale: Locale): TemplateSet {
  return { ...defaultTemplates(locale), ...getTemplateOverrides(ctx) };
}

export function saveTemplate(ctx: ServiceCtx, type: NotifyType, input: unknown): TemplateText {
  const parsed = TemplateText.parse(input);
  setInternalValue(ctx, 'notifyTemplates', JSON.stringify({ ...getTemplateOverrides(ctx), [type]: parsed }));
  return parsed;
}

export function resetTemplate(ctx: ServiceCtx, type: NotifyType): void {
  const { [type]: _dropped, ...rest } = getTemplateOverrides(ctx);
  setInternalValue(ctx, 'notifyTemplates', JSON.stringify(rest));
}
