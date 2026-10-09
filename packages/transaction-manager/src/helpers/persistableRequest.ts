import type { TransactionRequest } from '../types/transaction.types'

/**
 * The request as it can be written to storage.
 *
 * Transactions are persisted through `structuredClone` (IndexedDB), which
 * throws on functions. The Rhinestone request carries `onIntentSubmitted`, a
 * live observer, so persisting the request as-is fails every save and archive
 * for the whole intent: the record never reaches a stored terminal state, and
 * a reload has nothing to resume from.
 */
export const toPersistableRequest = (
  request: TransactionRequest | undefined,
): TransactionRequest | undefined => {
  if (request?.type !== 'rhinestone-intent') return request

  const { onIntentSubmitted: _observer, ...rhinestoneParams } =
    request.rhinestoneParams

  return { ...request, rhinestoneParams }
}
