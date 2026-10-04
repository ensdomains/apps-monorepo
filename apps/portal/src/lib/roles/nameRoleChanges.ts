import {
  type BignameError,
  type EventRow,
  fetchAllPages,
  isNameProfile,
  MAX_PAGE_SIZE,
  type Power,
  timestampToBigInt,
} from '@ens-apps/bigname'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import type { Role } from '@ensdomains/ensjs/utils/v2'
import { fromPromise } from 'neverthrow'
import { type Address, getAddress, type Hex, isAddressEqual } from 'viem'
import { bigname } from '@/lib/bigname'
import { registryPowersToRoles } from '@/lib/roles/registryPowerRoles'
import { normalizeOrLower } from '@/utils/ens/normalizeOrLower'

class GetNameRoleChangesError extends TaggedError('GetNameRoleChangesError')<{
  cause: BignameError
}> {}

/** One ENSv2 registry role change on a name's token, decoded for display. */
export type NameRoleChange = {
  readonly account: Address
  readonly oldRoles: readonly Role[]
  readonly newRoles: readonly Role[]
  readonly transactionHash: Hex
  readonly timestamp: bigint
  readonly blockNumber: bigint
}

export type GetNameRoleChangesParameters = {
  readonly name: string
  readonly registryAddress: Address
}

/** Bound on one registration's role changes; each is an explicit grant or revoke. */
const ROLE_CHANGES_MAX_ROWS = 2000

type EventRowOf<T extends EventRow['type']> = Extract<EventRow, { type: T }>

/**
 * The previous power set of a change: `powers` (the set after it) without
 * what it added, plus what it removed. Only an ENSv2 `EACRolesChanged` row
 * states the diff; without one, the account's previous row under the same
 * scope is the set before (an empty set when there is none).
 */
const previousPowers = (
  data: NonNullable<EventRowOf<'permission'>['data']>,
  lastSeen: readonly Power[] | undefined,
): readonly Power[] => {
  const { powers = [], added_powers: added, removed_powers: removed } = data
  if (!added || !removed) return lastSeen ?? []
  return [...powers.filter((power) => !added.includes(power)), ...removed]
}

/** A registry-scope role change on `registryAddress`'s token; other rows are not. */
const isRegistryRoleChange =
  (registryAddress: Address) =>
  (
    row: EventRow,
  ): row is EventRowOf<'permission'> & {
    data: NonNullable<EventRowOf<'permission'>['data']> & { address: string }
  } =>
    row.type === 'permission' &&
    !!row.data?.address &&
    row.data.grant_scope?.kind === 'registry' &&
    !!row.contract_address &&
    isAddressEqual(row.contract_address, registryAddress)

/**
 * Fold the rows, oldest first, into changes. Every row updates its account's
 * last-seen set, so a later row without a diff has its before set; a row with
 * no transaction or position is not listed.
 */
const toRoleChanges =
  (registryAddress: Address) =>
  (rows: readonly EventRow[]): NameRoleChange[] => {
    const lastSeen = new Map<Address, readonly Power[]>()
    const changes: NameRoleChange[] = []
    for (const row of rows.filter(isRegistryRoleChange(registryAddress))) {
      const account = getAddress(row.data.address)
      const powers = row.data.powers ?? []
      const before = previousPowers(row.data, lastSeen.get(account))
      lastSeen.set(account, powers)
      const timestamp = timestampToBigInt(row.timestamp)
      if (
        !row.transaction_hash ||
        row.block_number === null ||
        timestamp === undefined
      )
        continue
      changes.push({
        account,
        oldRoles: registryPowersToRoles(before),
        newRoles: registryPowersToRoles(powers),
        transactionHash: row.transaction_hash,
        timestamp,
        blockNumber: BigInt(row.block_number),
      })
    }
    return changes
  }

/**
 * Every ENSv2 registry role change on the name's current registration,
 * oldest first, from bigname.
 *
 * bigname serves a role change on a registry token as a `permission` row with
 * `grant_scope.kind: 'registry'` (`PermissionChanged`, the token's
 * `EACRolesChanged`). Anchoring the read on the name's current
 * `registration_id` scopes it as the old log scan's pinned `eacVersionId`
 * resource did: a previous owner's grants belong to an earlier registration.
 * Rows emitted by another contract than `registryAddress` are left out.
 *
 * Registry-wide changes on a registry's root resource (`RootPermissionChanged`)
 * are not served by bigname; those stay on the log scan in `roleChangeLogs.ts`.
 */
export const getNameRoleChanges = ({
  name,
  registryAddress,
}: GetNameRoleChangesParameters) =>
  fromPromise(
    (async () => {
      const detail = await bigname.getName(normalizeOrLower(name))
      const registrationId =
        detail && isNameProfile(detail.data)
          ? detail.data.registration_id
          : undefined
      if (!registrationId) return []
      const { rows } = await fetchAllPages(
        (cursor) =>
          bigname.listEvents({
            registration_id: registrationId,
            type: 'permission',
            include: ['data', 'raw'],
            order: 'asc',
            page_size: MAX_PAGE_SIZE,
            cursor,
          }),
        { maxRows: ROLE_CHANGES_MAX_ROWS },
      )
      return rows
    })(),
    (e) => new GetNameRoleChangesError({ cause: e as BignameError }),
  ).map(toRoleChanges(registryAddress))
