/**
 * Errors raised by Rhinestone session helpers.
 */

export class SessionError extends Error {
  constructor(
    public readonly reason: string,
    public readonly details?: string,
  ) {
    super(`${reason}${details ? `: ${details}` : ''}`)
    this.name = 'SessionError'
  }
}
