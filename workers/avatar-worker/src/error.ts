import { TaggedError } from '@ens-apps/utils/neverthrow'

export class MediaError extends TaggedError('MediaError')<{
  readonly status: 400 | 403 | 404 | 405 | 409 | 413 | 415 | 429 | 500 | 503
  readonly code: string
  readonly cause: unknown
}> {
  constructor(
    status: MediaError['status'],
    code: string,
    message: string,
    cause?: unknown,
  ) {
    super({ status, code, message, cause })
  }
}
