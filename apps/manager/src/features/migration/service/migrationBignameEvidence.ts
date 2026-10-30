import {
  type AddressName,
  type Envelope,
  type Meta,
  type NameRecord,
  toUnixSeconds,
} from '@ens-apps/indexer/bigname'
import { canSkipEmptySubtree } from '@ens-apps/migration'
import type { LookupNameRecord } from './bignameLookup'

const MAX_INDEX_AGE_SECONDS = 300n

export const hasVerifiedEmptyMigrationRoot = (params: {
  readonly inventory: Envelope<NameRecord>
  readonly name: string
  readonly node: string
  readonly selectedNames: readonly string[]
  readonly chainId: number
  readonly nowSeconds: bigint
}): boolean => {
  const { data, meta } = params.inventory
  return (
    data.read_status === 'ok' &&
    data.namespace === 'ens' &&
    data.authority === 'ens_v1' &&
    data.name.toLowerCase() === params.name.toLowerCase() &&
    data.namehash.toLowerCase() === params.node.toLowerCase() &&
    hasFreshCompletePublication({
      meta,
      chainId: params.chainId,
      nowSeconds: params.nowSeconds,
    }) &&
    canSkipEmptySubtree({
      shouldSkipEmptySubtrees: true,
      name: params.name,
      count: data.subname_count,
      meta,
      chainId: params.chainId,
      selectedNames: params.selectedNames,
    })
  )
}

export const hasFreshCompletePublication = (params: {
  readonly meta: Meta
  readonly chainId: number
  readonly nowSeconds: bigint
}): boolean => {
  const { meta, chainId, nowSeconds } = params
  const position = meta.as_of?.[String(chainId)]
  const timestamp = toUnixSeconds(position?.timestamp)
  return (
    position !== undefined &&
    Number.isSafeInteger(position.block_number) &&
    position.block_number >= 0 &&
    /^0x[0-9a-f]{64}$/i.test(position.block_hash) &&
    timestamp !== null &&
    nowSeconds - BigInt(timestamp) <= MAX_INDEX_AGE_SECONDS &&
    BigInt(timestamp) - nowSeconds <= MAX_INDEX_AGE_SECONDS &&
    (meta.completeness ?? 'full') === 'full' &&
    (meta.as_of_completeness?.[String(chainId)]?.completeness ?? 'full') ===
      'full' &&
    !meta.unsupported_fields?.length
  )
}

/** Join facts and counts only when they describe exactly the same publication. */
export const getNameRecordWithCount = (params: {
  readonly row: AddressName
  readonly meta: Meta
  readonly lookup: LookupNameRecord | undefined
  readonly chainId: number
  readonly nowSeconds: bigint
}): Envelope<NameRecord> | undefined => {
  const { row, lookup, chainId, nowSeconds } = params
  if (
    !lookup ||
    !hasFreshCompletePublication({ meta: params.meta, chainId, nowSeconds }) ||
    !hasFreshCompletePublication({ meta: lookup.meta, chainId, nowSeconds })
  )
    return undefined
  const countPosition = params.meta.as_of?.[String(chainId)]
  const detailPosition = lookup.meta.as_of?.[String(chainId)]
  const { record } = lookup
  if (
    !Number.isSafeInteger(row.subname_count) ||
    row.subname_count === undefined ||
    row.subname_count < 0 ||
    record.read_status !== 'ok' ||
    !['ens_v1', 'ens_v0'].includes(record.authority ?? '') ||
    record.authority !== row.authority ||
    record.status !== row.status ||
    record.namespace !== 'ens' ||
    row.namespace !== 'ens' ||
    record.name.toLowerCase() !== row.name.toLowerCase() ||
    record.namehash.toLowerCase() !== row.namehash.toLowerCase() ||
    countPosition?.block_number !== detailPosition?.block_number ||
    countPosition?.block_hash.toLowerCase() !==
      detailPosition?.block_hash.toLowerCase() ||
    toUnixSeconds(countPosition?.timestamp) !==
      toUnixSeconds(detailPosition?.timestamp)
  )
    return undefined
  return {
    data: { ...record, subname_count: row.subname_count },
    meta: lookup.meta,
  }
}
