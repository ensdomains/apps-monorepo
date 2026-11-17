import type { Subname } from '../reads/names.types'
import type { NameSummary } from '../reads/namesForAddress.types'
import type { RecordKeys } from '../reads/records.types'
import type { SyncStatus } from '../reads/registry.types'
import {
  toAddress,
  toDate,
  toExactSeconds,
  toExpiresAt,
  toProtocol,
} from './adapters'
import type {
  AddressName,
  Subname as BignameSubname,
  EnsV1Facts,
  NameRecords,
  StatusData,
} from './types'

const toWrapper = (facts: EnsV1Facts | undefined): Subname['wrapper'] => {
  if (!facts) return null
  const state = facts.wrapper_state
  return {
    state:
      state === 'wrapped' || state === 'emancipated' || state === 'locked'
        ? state
        : 'unwrapped',
    fuses: facts.wrapper_fuses?.fuses ?? 0,
    parentCannotControl: facts.wrapper_fuses?.parent_cannot_control ?? false,
    expiresAt: toDate(facts.wrapper_expires_at),
  }
}

export const toSubname = (row: BignameSubname): Subname => ({
  name: row.name,
  displayName: row.display_name,
  namehash: row.namehash,
  labelhash: row.labelhash ?? null,
  owner: toAddress(row.owner),
  protocol: toProtocol(row.authority),
  registrationStatus: row.status,
  expiresAt: toExpiresAt(row),
  wrapper: row.authority === 'ens_v2' ? null : toWrapper(row.ens_v1),
  ...(row.subname_count !== undefined && { subnameCount: row.subname_count }),
})

/** Unlike `toNameSummary`, keeps no relations: the address held the name once. */
export const toGraceSummary = (row: AddressName): NameSummary => ({
  name: row.name,
  displayName: row.display_name,
  namehash: row.namehash,
  protocol: toProtocol(row.authority),
  relations: [],
  isPrimary: row.is_primary,
  isMigrated: row.migrated_at !== undefined,
  registrationStatus: row.status,
  expiresAt: toDate(row.expires_at),
  servedExpiry: toExactSeconds(row.expires_at),
  graceEndsAt: toDate(row.grace_ends_at),
  registeredAt: toDate(row.registered_at),
  createdAt: toDate(row.created_at),
})

const DECIMAL = /^\d+$/

/** Null when bigname has no record inventory for the name. */
export const toRecordKeys = ({
  resolver,
  inventory,
}: NameRecords): RecordKeys | null =>
  inventory
    ? {
        resolver: toAddress(resolver?.address),
        knownKeys: inventory.known_keys,
        unsetKeys: inventory.unset_keys,
        unsupportedKeys: inventory.unsupported_keys,
        abiContentTypes:
          inventory.abi_content_types
            ?.filter((type) => DECIMAL.test(type))
            .map(BigInt) ?? null,
      }
    : null

export const toSyncStatus = (
  data: StatusData,
  chainId: number,
): SyncStatus => ({
  indexedBlock: data.chains[String(chainId)]?.indexed_block ?? null,
})
