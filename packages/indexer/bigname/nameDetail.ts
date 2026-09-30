import { errAsync, okAsync } from 'neverthrow'
import type { IndexerReadError } from '../reads/errors'
import type { NameDetail, ReadNameDetail } from '../reads/nameDetail.types'
import { toAddress, toDate, toProtocol, toReadError } from './adapters'
import type { BignameClient } from './client'
import type { NameRecord } from './types'

const toNameDetail = (record: NameRecord): NameDetail => ({
  name: record.name,
  displayName: record.display_name,
  namehash: record.namehash,
  protocol: toProtocol(record.authority),
  isSupported: record.status !== 'unsupported',
  owner: toAddress(record.owner),
  manager: toAddress(record.manager),
  registrant: toAddress(record.registrant),
  resolver: toAddress(record.resolver?.address),
  registrationStatus: record.registration_status ?? null,
  expiresAt: toDate(record.expires_at),
  registeredAt: toDate(record.registered_at),
  createdAt: toDate(record.created_at),
  migratedAt: toDate(record.migrated_at),
})

// A 404, or a 200 whose status is not_found, means the name is not indexed:
// an answer, not a failure.
export const readNameDetail =
  (client: BignameClient): ReadNameDetail =>
  ({ name }) =>
    client
      .name(name)
      .map(({ data }): NameDetail | null =>
        data.status === 'not_found' ? null : toNameDetail(data),
      )
      .orElse((error) =>
        error.code === 'not_found'
          ? okAsync<NameDetail | null, IndexerReadError>(null)
          : errAsync<NameDetail | null, IndexerReadError>(toReadError(error)),
      )
