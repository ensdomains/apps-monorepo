import type { AddressName } from '@ens-apps/indexer/bigname'
import type { NameSummary, ProtocolVersion } from '@ens-apps/indexer/reads'
import type { Hex } from 'viem'
import { isRenewableV2EthName } from '@/features/grace/utils/gracePeriod'

export type DashboardNameRole = 'owner' | 'manager'

/** One name related to the connected addresses, as the dashboard lists it. */
export type DashboardName = {
  readonly key: Hex
  readonly name: string
  readonly protocol: ProtocolVersion
  /** Unix seconds; a number as it only drives display and sorting. `0` never expires. */
  readonly expiryDate: number
  readonly createdAt: number | null
  readonly nameRoles: readonly DashboardNameRole[]
}

const DASHBOARD_ROLES: readonly DashboardNameRole[] = ['owner', 'manager']

const HIDDEN_STATUSES: readonly NameSummary['registrationStatus'][] = [
  'released',
  'unregistered',
]

const toSeconds = (date: Date | null): number | null =>
  date ? Math.floor(date.getTime() / 1000) : null

export const isListedName = (name: NameSummary): boolean =>
  !name.name.endsWith('.reverse') &&
  !HIDDEN_STATUSES.includes(name.registrationStatus)

// bigname's `owner` is the token holder and `registrant` the ENSv1 registrar
// holder, both owners here; `manager` covers ENSv2 role holders too.
const toNameRoles = (
  relations: NameSummary['relations'],
): readonly DashboardNameRole[] =>
  DASHBOARD_ROLES.filter((role) =>
    role === 'owner'
      ? relations.includes('owner') || relations.includes('registrant')
      : relations.includes('manager'),
  )

export const toDashboardName = (name: NameSummary): DashboardName => ({
  key: name.namehash,
  name: name.name,
  protocol: name.protocol ?? 'v2',
  expiryDate: toSeconds(name.expiresAt) ?? 0,
  createdAt: toSeconds(name.createdAt),
  nameRoles: toNameRoles(name.relations),
})

const toSafeSeconds = (timestamp: string | undefined): number | null => {
  const seconds = Number(timestamp)
  return timestamp !== undefined && Number.isSafeInteger(seconds)
    ? seconds
    : null
}

/**
 * An ENSv2 `.eth` name the address held until it expired, still renewable.
 * It holds no current role, so it carries none.
 */
export const toGraceName = (
  row: AddressName,
  address: string,
  now: Date,
): DashboardName | null => {
  const expiryDate = toSafeSeconds(row.expires_at)
  const isGrace =
    row.authority === 'ens_v2' &&
    row.registration_status === 'released' &&
    row.lapsed_registration?.release_kind === 'expired' &&
    row.lapsed_registration.owner?.toLowerCase() === address.toLowerCase() &&
    expiryDate !== null &&
    expiryDate * 1000 <= now.getTime() &&
    isRenewableV2EthName(row.name, new Date(expiryDate * 1000), now)
  if (!isGrace) return null
  return {
    key: row.namehash,
    name: row.name,
    protocol: 'v2',
    expiryDate,
    createdAt: toSafeSeconds(row.created_at),
    nameRoles: [],
  }
}

const byProtocolV2First = (left: DashboardName, right: DashboardName) =>
  Number(right.protocol === 'v2') - Number(left.protocol === 'v2')

/**
 * Rows for one name from several addresses collapse into one, with the roles
 * of every address. A current row wins over a grace row for the same name.
 */
export const mergeDashboardNames = (
  names: readonly DashboardName[],
): readonly DashboardName[] =>
  Array.from(new Set(names.map(({ key }) => key))).flatMap((key) => {
    const rows = names
      .filter((name) => name.key === key)
      .sort(byProtocolV2First)
    const current = rows.find((row) => row.nameRoles.length > 0) ?? rows[0]
    if (!current) return []
    return [
      {
        ...current,
        nameRoles: DASHBOARD_ROLES.filter((role) =>
          rows.some((row) => row.nameRoles.includes(role)),
        ),
      },
    ]
  })
