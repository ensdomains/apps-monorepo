import { errAsync, okAsync } from 'neverthrow'
import type { IndexerReadError } from '../reads/errors'
import type { NameDetail, ReadNameDetail } from '../reads/nameDetail.types'
import {
  toAddress,
  toDate,
  toExpiresAt,
  toProtocol,
  toReadError,
} from './adapters'
import type { BignameClient } from './client'
import type { NameRecord } from './types'

/** The fields a name record and a lookup record share. */
type DetailRecord = Pick<
  NameRecord,
  | 'name'
  | 'display_name'
  | 'namehash'
  | 'read_status'
  | 'authority'
  | 'owner'
  | 'manager'
  | 'registrant'
  | 'resolver'
  | 'status'
  | 'ens_v1'
  | 'expires_at'
  | 'grace_ends_at'
  | 'registered_at'
  | 'registration_id'
  | 'created_at'
  | 'migrated_at'
  | 'unresolvable_reason'
>

export const toNameDetail = (record: DetailRecord): NameDetail => ({
  name: record.name,
  displayName: record.display_name,
  namehash: record.namehash,
  protocol: toProtocol(record.authority),
  isSupported: record.read_status !== 'unsupported',
  owner: toAddress(record.owner),
  manager: toAddress(record.manager),
  registrant: toAddress(record.registrant),
  resolver: toAddress(record.resolver?.address),
  registrationStatus: record.status ?? null,
  expiresAt: toExpiresAt(record),
  graceEndsAt: toDate(record.grace_ends_at),
  registeredAt: toDate(record.registered_at),
  registrationId: record.registration_id ?? null,
  createdAt: toDate(record.created_at),
  migratedAt: toDate(record.migrated_at),
  unresolvableReason: record.unresolvable_reason ?? null,
})

// A 404, or a 200 whose read_status is not_found, means the name is not indexed:
// an answer, not a failure.
export const readNameDetail =
  (client: BignameClient): ReadNameDetail =>
  ({ name }, options) =>
    client
      .name(name, { namespace: 'ens' }, options)
      .map(({ data }): NameDetail | null =>
        data.read_status === 'not_found' ? null : toNameDetail(data),
      )
      .orElse((error) =>
        error.code === 'not_found'
          ? okAsync<NameDetail | null, IndexerReadError>(null)
          : errAsync<NameDetail | null, IndexerReadError>(toReadError(error)),
      )
