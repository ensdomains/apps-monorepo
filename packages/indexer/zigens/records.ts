import type { RecordKeys } from '../reads/records.types'
import { toAccount } from '../shared/values'

/** A resolver's record fields, as zigens and ENSNode both serve them. */
export type ResolverRecords = Readonly<{
  address: string
  texts: readonly string[] | null
  coinTypes: readonly string[] | null
  contentHash: string | null
  /** zigens only; ENSNode cannot list ABIs. */
  abis?: readonly number[] | null
}>

/** The record keys set at a resolver, in bigname's record-key grammar. */
export const toRecordKeys = (resolver: ResolverRecords | null): RecordKeys => ({
  resolver: toAccount(resolver?.address),
  inventory: {
    knownKeys: [
      ...(resolver?.texts ?? []).map((key) => `text:${key}`),
      ...(resolver?.coinTypes ?? []).map((coinType) => `addr:${coinType}`),
      ...(resolver?.contentHash ? ['contenthash'] : []),
    ],
    // Neither indexer keeps cleared keys or keys it cannot serve.
    unsetKeys: [],
    unsupportedKeys: [],
    abiContentTypes:
      resolver?.abis === undefined
        ? null
        : (resolver.abis ?? [])
            .map((type) => BigInt(type))
            .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
  },
})
