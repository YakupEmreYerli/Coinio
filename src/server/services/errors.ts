export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
  }
}
