import { parseRecordKey } from '@ens-apps/indexer/bigname'
import type { LookupNameRecord } from './bignameLookup'
import { hasKnownContentHashGetter } from './fetchV1Profiles.helpers'
import { hasFreshCompletePublication } from './migrationBignameEvidence'
import type { V1ProfileKeys, V1ProfileSource } from './v1ProfileKeys'

const UINT256_LIMIT = 1n << 256n

const isAbiContentType = (value: string) => {
  if (!/^[1-9][0-9]{0,77}$/.test(value)) return false
  const contentType = BigInt(value)
  return (
    contentType < UINT256_LIMIT && (contentType & (contentType - 1n)) === 0n
  )
}

/** Missing proof uses the independently read source inventory, never an empty profile. */
export const getV1ProfileKeysFromLookup = ({
  source,
  lookup,
  chainId,
  nowSeconds,
}: {
  readonly source: V1ProfileSource
  readonly lookup: LookupNameRecord | undefined
  readonly chainId: number
  readonly nowSeconds: bigint
}): V1ProfileKeys | undefined => {
  if (
    !lookup ||
    !hasKnownContentHashGetter({ resolver: source.resolver, chainId })
  )
    return undefined
  const { record, meta } = lookup
  if (
    !hasFreshCompletePublication({ meta, chainId, nowSeconds }) ||
    record.read_status !== 'ok' ||
    record.namespace !== 'ens' ||
    !['ens_v1', 'ens_v0'].includes(record.authority ?? '') ||
    record.name.toLowerCase() !== source.name.toLowerCase() ||
    record.namehash.toLowerCase() !== source.id.toLowerCase() ||
    record.resolver?.chain_id !== chainId ||
    record.resolver.address.toLowerCase() !== source.resolver.toLowerCase() ||
    record.unsupported_fields?.length
  )
    return undefined
  const records = record.records
  if (
    !records?.seen_abis ||
    records.abi_unsupported_reason !== undefined ||
    !records.seen_abis.every(isAbiContentType) ||
    !records.seen_addresses.every((coinType) =>
      parseRecordKey(`addr:${coinType}`),
    ) ||
    !records.seen_texts.every((key) => parseRecordKey(`text:${key}`))
  )
    return undefined
  return {
    id: source.id.toLowerCase(),
    texts: [...new Set(records.seen_texts)].sort(),
    coinTypes: [...new Set(records.seen_addresses)].sort().map(Number),
    hasContentHash:
      records.seen_singletons.includes('contenthash') || !!records.contenthash,
    abiContentTypes: records.seen_abis.map(BigInt),
    interfaceIds: [],
    ...(records.seen_singletons.includes('name') && { hasName: true }),
  }
}
