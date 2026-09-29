import { errAsync, okAsync } from 'neverthrow'
import type { IndexerReadError } from '../contracts/errors'
import type { NameDetail, ReadNameDetail } from '../contracts/nameDetail.types'
import { toAddress, toDate, toProtocol, toReadError } from './adapters'
import type { BignameClient } from './client'
import type { NameRecord } from './types'

const toNameDetail = (record: NameRecord): NameDetail => ({
  name: record.name,
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

// A 404 means the name is not indexed, which is an answer, not a failure.
export const readNameDetail =
  (client: BignameClient): ReadNameDetail =>
  ({ name }) =>
    client
      .name(name)
      .map(({ data }): NameDetail | null => toNameDetail(data))
      .orElse((error) =>
        error.code === 'not_found'
          ? okAsync<NameDetail | null, IndexerReadError>(null)
          : errAsync<NameDetail | null, IndexerReadError>(toReadError(error)),
      )
