export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
  }
}

export type LimitedResource = 'subscriptions' | 'channels' | 'apiKeys';

export class LimitError extends Error {
  constructor(
    readonly resource: LimitedResource,
    readonly limit: number,
  ) {
    super(`limit of ${limit} ${resource} reached`);
  }
}

/** Throws a LimitError when `current` already reached the configured limit (null means no limit). */
export function checkLimit(resource: LimitedResource, limit: number | null, current: number): void {
  if (limit !== null && current >= limit) throw new LimitError(resource, limit);
}
