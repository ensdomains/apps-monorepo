import {
  type BignameClient,
  type Envelope,
  type NameRecord,
  readAllEnvelopes,
} from '@ens-apps/indexer/bigname'
import { okAsync, ResultAsync } from 'neverthrow'
import { lookupNameRecords } from './bignameLookup'
import {
  getNameRecordWithCount,
  hasFreshCompletePublication,
} from './migrationBignameEvidence'

export const getMigrationInventoryIndexer = async (params: {
  readonly indexer: BignameClient
  readonly ownerAddress?: string | null
  readonly names: readonly string[]
  readonly chainId: number
  readonly signal?: AbortSignal
}): Promise<BignameClient> => {
  const { indexer, signal, ownerAddress } = params
  signal?.throwIfAborted()
  const names = [...new Set(params.names.map((name) => name.toLowerCase()))]
  if (!ownerAddress || names.length < 3) return indexer
  // Keep each counts page's publication so later pages obey the same evidence checks.
  const batch = await ResultAsync.fromPromise(
    Promise.all([
      readAllEnvelopes(
        (cursor, requestSignal) =>
          indexer.addressNames(
            ownerAddress,
            {
              namespace: 'ens',
              relation: 'any',
              authority: ['ens_v1', 'ens_v0'],
              include: ['counts'],
              sort: 'name',
              page_size: 200,
              ...(cursor !== undefined && { cursor }),
            },
            { signal: requestSignal },
          ),
        { signal },
      ),
      lookupNameRecords(indexer.lookup, names, { signal }),
    ]),
    (cause: unknown) => cause,
  )
  signal?.throwIfAborted()
  if (batch.isErr()) return indexer
  const [counts, details] = batch.value
  if (counts.isErr() || details.isErr()) return indexer
  const records = new Map(
    details.value.map(
      (record) => [record.record.name.toLowerCase(), record] as const,
    ),
  )
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000))
  const entries = counts.value.flatMap(({ data, meta }) =>
    data.flatMap((row) => {
      const result = getNameRecordWithCount({
        row,
        meta,
        lookup: records.get(row.name.toLowerCase()),
        chainId: params.chainId,
        nowSeconds,
      })
      return result ? [[row.name.toLowerCase(), result] as const] : []
    }),
  )
  const inventories = new Map<string, Envelope<NameRecord>>(entries)
  return {
    ...indexer,
    name: (name, query, options) => {
      const result = inventories.get(name.toLowerCase())
      const isCurrentCountRead =
        query?.include?.includes('counts') &&
        query.at === undefined &&
        (query.source ?? 'indexed') === 'indexed' &&
        (query.finality ?? 'latest') === 'latest' &&
        (query.namespace ?? 'ens') === 'ens'
      return result &&
        isCurrentCountRead &&
        !options?.signal?.aborted &&
        hasFreshCompletePublication({
          meta: result.meta,
          chainId: params.chainId,
          nowSeconds: BigInt(Math.floor(Date.now() / 1000)),
        })
        ? okAsync(result)
        : indexer.name(name, query, options)
    },
  }
}
