import type {
  Envelope,
  Finality,
  Namespace,
  ResolverRef,
  ResultStatus,
  Source,
} from './common.types'

/** `GET /v1/names/{name}/records`: the closed product record-key grammar. */
export type RecordKey =
  | `addr:${number}`
  | `text:${string}`
  | 'avatar'
  | 'contenthash'

/** `GET /v1/names/{name}/records`: query. */
export type NameRecordsQuery = Readonly<{
  namespace?: Namespace
  at?: string
  finality?: Finality
  source?: Source | 'auto'
  /** At most 200 keys. */
  keys?: readonly RecordKey[]
  include?: readonly 'inventory'[]
}>

/** `GET /v1/names/{name}/records`: `meta` on an ENSIP-19 derived answer. */
export type RecordAnswerMeta = Readonly<{
  basis: 'derived'
  rule: 'ensip19_default_address'
  source_record_key: 'addr:2147483648'
}>

/** `GET /v1/names/{name}/records`: one per-key answer; `value` only when `status` is `ok`. */
export type RecordAnswer = Readonly<{
  status: ResultStatus
  /** Text values are strings; address and contenthash values are lowercase hex. */
  value?: string
  unsupported_reason?: string
  failure_reason?: string
  meta?: RecordAnswerMeta
}>

/** `GET /v1/names/{name}/records?include=inventory`: why `abi_content_types` is null. */
export type AbiUnsupportedReason =
  | 'inventory_not_available'
  | 'inventory_not_authoritative'
  | 'abi_observations_not_supported'
  | 'abi_observations_stale'
  | 'abi_content_type_not_single_bit'

/** `GET /v1/names/{name}/records?include=inventory`, `POST /v1/lookup` `include=inventory`. */
export type RecordInventory = Readonly<{
  known_keys: readonly string[]
  unset_keys: readonly string[]
  unsupported_keys: readonly string[]
  /** Canonical decimal strings of single-bit uint256 content types, ascending; null when unlistable. */
  abi_content_types: readonly string[] | null
  /** Present exactly when `abi_content_types` is null. */
  abi_unsupported_reason?: AbiUnsupportedReason
}>

/** `GET /v1/names/{name}/records`: `data`; `resolver` is null when no exact registry pointer is served. */
export type NameRecords = Readonly<{
  namespace: Namespace
  resolver: ResolverRef | null
  /** Keyed by `RecordKey`; `{}` when there is no key to answer. */
  records: Readonly<Partial<Record<RecordKey, RecordAnswer>>>
  inventory?: RecordInventory
}>

/** `GET /v1/names/{name}/records`: response. */
export type NameRecordsResponse = Envelope<NameRecords>

/** `GET /v1/names/{name}`, detail lookup: resolver keys and values, grouped. */
export type RecordGroups = Readonly<{
  /** Observed canonical decimal coin types. */
  seen_addresses: readonly string[]
  /** Null means cleared; a seen key absent here has an unknown value. */
  addresses: Readonly<Record<string, string | null>>
  /** Observed text keys, including ones whose value is null or unknown. */
  seen_texts: readonly string[]
  texts: Readonly<Record<string, string | null>>
  /** Observed decimal ABI content types; absent when they cannot be enumerated. */
  seen_abis?: readonly string[]
  abi_unsupported_reason?: string
  abis: Readonly<Record<string, string | null>>
  /** Singletons whose write was observed or whose key was verified. */
  seen_singletons: readonly ('contenthash' | 'name')[]
  /** Null when cleared or unset, absent when unknown. */
  contenthash?: string | null
  name?: string | null
}>
