import { isAddress } from 'viem'
import type {
  Address,
  NameRelation,
  ProtocolVersion,
} from '../reads/common.types'
import { IndexerReadError } from '../reads/errors'
import type { BignameError } from './errors'
import type { Authority, Relation, Timestamp } from './types'

const UNIX_SECONDS = /^-?\d+$/
// An explicit zone is required; without one `Date.parse` reads local time.
const RFC_3339 =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/
const MS_PER_SECOND = 1000
// The largest instant a JavaScript Date can hold.
const MAX_DATE_MS = 8.64e15

/**
 * bigname documents RFC 3339 but currently sends unix seconds as a decimal
 * string, so both are accepted. Anything else is null rather than an
 * `Invalid Date`, which would otherwise travel as a real value.
 */
const toEpochMs = (value: Timestamp | undefined): number | null => {
  if (value === undefined) return null
  const ms = UNIX_SECONDS.test(value)
    ? Number(value) * MS_PER_SECOND
    : RFC_3339.test(value)
      ? Date.parse(value)
      : Number.NaN
  return Number.isFinite(ms) && Math.abs(ms) <= MAX_DATE_MS ? ms : null
}

export const toUnixSeconds = (value: Timestamp | undefined): number | null => {
  const ms = toEpochMs(value)
  return ms === null ? null : Math.floor(ms / MS_PER_SECOND)
}

export const toDate = (value: Timestamp | undefined): Date | null => {
  const ms = toEpochMs(value)
  return ms === null ? null : new Date(ms)
}

// ens_v0 is a v1 name whose registry record still comes from the 2017
// registry; the apps only distinguish v1 from v2.
const PROTOCOL_BY_AUTHORITY: Record<Authority, ProtocolVersion> = {
  ens_v0: 'v1',
  ens_v1: 'v1',
  ens_v2: 'v2',
}

export const toProtocol = (
  authority: Authority | undefined,
): ProtocolVersion | null =>
  authority === undefined ? null : PROTOCOL_BY_AUTHORITY[authority]

export const toAddress = (value: string | undefined): Address | null =>
  value !== undefined && isAddress(value) ? value : null

// `resolves_to` is a record relation, not a control relation.
export const toRelations = (
  relations: readonly Relation[],
): readonly NameRelation[] =>
  relations.filter(
    (relation): relation is NameRelation => relation !== 'resolves_to',
  )

export const toReadError = (error: BignameError): IndexerReadError => {
  const kind =
    error.code === 'stale'
      ? 'stale'
      : error.code === 'invalid_input' || error.code === 'unsupported'
        ? 'rejected'
        : 'unavailable'
  return new IndexerReadError({ kind, message: error.message, cause: error })
}
