import {
  DomainDocument,
  type DomainFragment,
  type DomainQuery,
} from '@ens-apps/indexer'
import indexerClient from '@ens-apps/indexer/urql'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { ok, ResultAsync } from 'neverthrow'

class GetIndexerDomainError extends TaggedError('GetIndexerDomainError')<{
  cause: unknown
}> {}

/**
 * In-flight request deduplication: when multiple consumers query the same
 * domain simultaneously, only one network request is made.
 */
const inflight = new Map<string, Promise<DomainQuery>>()

function fetchDomain(name: string): Promise<DomainQuery> {
  const existing = inflight.get(name)
  if (existing) return existing

  const promise = indexerClient
    .query<DomainQuery>(DomainDocument, { id: name })
    .toPromise()
    .then((result) => {
      if (result.error) throw result.error
      if (!result.data) throw new Error('Indexer query returned no data')
      return result.data
    })
    .finally(() => {
      inflight.delete(name)
    })

  inflight.set(name, promise)
  return promise
}

export const getIndexerDomain = ResultFn(async function* (name: string) {
  const data = yield* await ResultAsync.fromPromise(
    fetchDomain(name),
    (error) => new GetIndexerDomainError({ cause: error }),
  )

  return ok(data.domain ?? null)
})

export type { DomainFragment }

export const indexerDomainQuery = (name: string) =>
  resultQueryOptions({
    queryKey: qk('profile', 'domain', { name }),
    queryFn: ({ queryKey: [{ name }] }) => getIndexerDomain(name),
  })
