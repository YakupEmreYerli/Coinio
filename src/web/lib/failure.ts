import { ApiError } from '../api';
import { t } from '../i18n';

/** What to tell the user when a request failed: a reached limit by name, anything else generically. */
export function failureText(e: unknown): string {
  if (e instanceof ApiError && e.code === 'limit_reached') return t('error.limitReached', { limit: String(e.limit ?? '') });
  return t('error.generic');
}
