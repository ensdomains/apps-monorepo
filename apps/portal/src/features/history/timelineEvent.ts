import type { Address, Hex } from 'viem'

/**
 * TODO(indexer): add `from` (tx sender) to `Event` so the actor leading each row is
 * first-class instead of RPC-backfilled (see useTransactionSenders).
 * TODO(indexer): add typed decoders for ContenthashChanged / NameChanged so those
 * actions don't rely on parsing the raw `data` JSON (see summarize/decodeRawData.ts).
 */

/** Marks an event adapted from the v1 subgraph rather than the v2 indexer. */
export const V1_PROTOCOL = 'v1'

/**
 * On-chain integer params. The v2 indexer sends these as JSON numbers, but v1
 * values are adapted from subgraph strings and must not round-trip through
 * `Number` — a uint64 expiry or uint256 coin type exceeds
 * `Number.MAX_SAFE_INTEGER`. Nothing does arithmetic on them; they are
 * stringified for the decoded-param table, which handles either.
 */
type OnChainInt = number | bigint | null

export type TimelineDecoded = {
  readonly asAddressChanged?: {
    address?: string | null
    coinType?: OnChainInt
    resolver?: string | null
    namehash?: string | null
  } | null
  readonly asTextChanged?: {
    key?: string | null
    value?: string | null
    resolver?: string | null
    namehash?: string | null
  } | null
  readonly asTransfer?: {
    from?: string | null
    to?: string | null
    id?: string | null
    operator?: string | null
    value?: string | null
  } | null
  readonly asRegistryTransfer?: {
    node?: string | null
    owner?: string | null
  } | null
  readonly asLabelRegistered?: {
    name?: string | null
    owner?: string | null
    registry?: string | null
    tokenId?: string | null
    sender?: string | null
    canonicalId?: string | null
    expiry?: OnChainInt
  } | null
  readonly asNameRegistered?: {
    name?: string | null
    label?: string | null
    owner?: string | null
    cost?: string | null
    baseCost?: string | null
    premium?: string | null
    referrer?: string | null
    expires?: OnChainInt
  } | null
  readonly asNameRenewed?: {
    id?: string | null
    expires?: OnChainInt
  } | null
  readonly asResolverUpdated?: {
    resolver?: string | null
    sender?: string | null
    tokenId?: string | null
  } | null
  readonly asReverseClaimed?: {
    address?: string | null
    node?: string | null
  } | null
  readonly asNameWrapped?: {
    node?: string | null
    owner?: string | null
    fuses?: OnChainInt
    expiry?: OnChainInt
  } | null
  readonly asNameUnwrapped?: {
    node?: string | null
    owner?: string | null
  } | null
  readonly asFusesSet?: { node?: string | null; fuses?: OnChainInt } | null
  readonly asExpiryUpdated?: {
    node?: string | null
    tokenId?: string | null
    expiry?: OnChainInt
  } | null
}

export type TimelineIndexerEvent = TimelineDecoded & {
  readonly id: string
  readonly type: string
  readonly name?: string | null
  readonly namehash?: string | null
  readonly protocol?: string | null
  readonly transactionHash: Hex
  readonly blockNumber: number
  readonly timestamp: number
  readonly contractAddress?: Address | null
  readonly key?: string | null
  readonly value?: string | null
  /** Raw JSON blob of decoded params — fallback for event types without an `as*` decoder. */
  readonly data?: string | null
}
export const TIMELINE_EVENT_FRAGMENT = `  fragment TimelineEvent on Event {
    id
    type
    name
    namehash
    protocol
    transactionHash
    blockNumber
    timestamp
    contractAddress
    key
    value
    data
    asAddressChanged { address coinType resolver namehash }
    asTextChanged { key value resolver namehash }
    asTransfer { from to id operator value }
    asRegistryTransfer { node owner }
    asLabelRegistered { name owner registry tokenId sender canonicalId expiry }
    asNameRegistered { name label owner cost baseCost premium referrer expires }
    asNameRenewed { id expires }
    asResolverUpdated { resolver sender tokenId }
    asReverseClaimed { address node }
    asNameWrapped { node owner fuses expiry }
    asNameUnwrapped { node owner }
    asFusesSet { node fuses }
    asExpiryUpdated { node tokenId expiry }
  }`
