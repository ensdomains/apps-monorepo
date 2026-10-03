import { isAddress } from 'viem'
import type {
  Address,
  NameRelation,
  ProtocolVersion,
} from '../reads/common.types'
import { IndexerReadError } from '../reads/errors'
import type { BignameError } from './errors'
import type { Authority, Relation, Timestamp } from './types'

export const toDate = (value: Timestamp | undefined): Date | null =>
  value === undefined ? null : new Date(value)

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
