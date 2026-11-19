import type { Config } from '../config.js';
import type { Db } from '../db/client.js';

export type LookupFn = (host: string) => Promise<{ address: string; family: number }[]>;

/** `lookup` resolves host names before the server fetches a user-supplied site (defaults to the system resolver). */
export type ServiceCtx = { db: Db; config: Config; fetch: typeof fetch; now: () => Date; lookup?: LookupFn };
