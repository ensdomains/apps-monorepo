import { TaggedError } from '@ens-apps/utils/neverthrow'

/**
 * Why a read failed, in terms a feature can act on. `stale` means a cursor's
 * snapshot moved on and the read should restart from page one; `rejected`
 * means the backend refused the request as sent; `unavailable` is everything
 * transient. The backend's own error rides along as `cause`.
 */
export type IndexerReadErrorKind = 'stale' | 'rejected' | 'unavailable'

export class IndexerReadError extends TaggedError('INDEXER_READ_ERROR')<{
  readonly kind: IndexerReadErrorKind
  readonly cause: unknown
}> {}
