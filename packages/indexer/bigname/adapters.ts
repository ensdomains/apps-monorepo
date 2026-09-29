import { isAddress } from 'viem'
import type {
  Address,
  NameRelation,
  ProtocolVersion,
} from '../contracts/common.types'
import { IndexerReadError } from '../contracts/errors'
import type { BignameError } from './errors'
import type { Authority, Relation, Timestamp } from './types'

export const toDate = (value: Timestamp | undefined): Date | null =>
  value === undefined ? null : new Date(value)

export const toProtocol = (
  authority: Authority | undefined,
): ProtocolVersion | null => {
  if (authority === undefined) return null
  return authority === 'ens_v2' ? 'v2' : 'v1'
}

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
