import type { AddressName } from '@ens-apps/indexer/bigname'
import type { NameSummary, ProtocolVersion } from '@ens-apps/indexer/reads'
import type { Hex } from 'viem'
import { isRenewableV2EthName } from '@/features/grace/utils/gracePeriod'
import { toDateFromSeconds } from './utils'

export type DashboardNameRole = 'owner' | 'manager'

/** One name related to the connected addresses, as the dashboard lists it. */
export type DashboardName = {
  readonly key: Hex
  readonly name: string
  readonly protocol: ProtocolVersion
  /** Unix seconds; `0n` when the name does not expire. */
  readonly expiryDate: bigint
  readonly createdAt: bigint | null
  readonly nameRoles: readonly DashboardNameRole[]
  /** An ENSv2 name the address held until it expired, still renewable in grace. */
  readonly isLapsed: boolean
}

const DASHBOARD_ROLES: readonly DashboardNameRole[] = ['owner', 'manager']

const HIDDEN_STATUSES: readonly NameSummary['registrationStatus'][] = [
  'released',
  'unregistered',
]

const toSeconds = (date: Date | null): bigint | null =>
  date ? BigInt(Math.floor(date.getTime() / 1000)) : null

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
  expiryDate: toSeconds(name.expiresAt) ?? 0n,
  createdAt: toSeconds(name.createdAt),
  nameRoles: toNameRoles(name.relations),
  isLapsed: false,
})

/** Names the connected accounts hold, or held until a grace they can still renew in. */
export const isHeldName = (name: DashboardName): boolean =>
  name.nameRoles.includes('owner') || name.isLapsed

const parseSeconds = (timestamp: string | undefined): bigint | null =>
  timestamp !== undefined && /^\d+$/.test(timestamp) ? BigInt(timestamp) : null

/**
 * An ENSv2 `.eth` name the address held until it expired, still renewable.
 * It holds no current role, so it carries none.
 */
export const toGraceName = (
  row: AddressName,
  address: string,
  now: Date,
): DashboardName | null => {
  const expiryDate = parseSeconds(row.expires_at)
  const nowSeconds = BigInt(Math.floor(now.getTime() / 1000))
  const isGrace =
    row.authority === 'ens_v2' &&
    row.registration_status === 'released' &&
    row.lapsed_registration?.release_kind === 'expired' &&
    row.lapsed_registration.owner?.toLowerCase() === address.toLowerCase() &&
    expiryDate !== null &&
    expiryDate <= nowSeconds &&
    isRenewableV2EthName(row.name, toDateFromSeconds(Number(expiryDate)), now)
  if (!isGrace) return null
  return {
    key: row.namehash,
    name: row.name,
    protocol: 'v2',
    expiryDate,
    createdAt: parseSeconds(row.created_at),
    nameRoles: [],
    isLapsed: true,
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
