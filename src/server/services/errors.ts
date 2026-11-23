export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
  }
}

export class BadRequestError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export class UnauthorizedError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export class ForbiddenError extends Error {
  constructor(readonly code = 'forbidden') {
    super(code);
  }
}

export class ConflictError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export class GoneError extends Error {
  constructor(readonly code: string) {
    super(code);
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
