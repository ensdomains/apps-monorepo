import { type AddressName, toDate } from '@ens-apps/indexer/bigname'
import type {
  NameRegistrationStatus,
  NameRelation,
  NameSummary,
} from '@ens-apps/indexer/reads'
import { match, P } from 'ts-pattern'
import type { DateRange } from '@/utils/formatting/formatDateRange'
import {
  dateToPlainDate,
  toValidDate,
  unixSecondsToPlainDateUtc,
} from '@/utils/temporal'
import type { ProtocolVersion } from '@/utils/types'

/** How the address relates to a name, including a name it held until it expired. */
export type AddressNameRelation = NameRelation | 'former_owner'

/** A name associated with an address, as the address pages list it. */
export type AddressNameItem = {
  readonly name: string
  /** Null when the name does not expire. */
  readonly expiryDate: Date | null
  /**
   * Set on a subname that lapses with the names above it, even before its own
   * expiry: the earliest of their expiries. Null when one couldn't be read.
   */
  readonly parentExpiryDate?: Date | null
  /** The name above whose expiry `parentExpiryDate` is. */
  readonly parentExpiryName?: string
  readonly graceEndDate: Date | null
  readonly status: NameRegistrationStatus
  readonly subdomainCount?: number
  readonly recordCount?: number
  readonly relations: readonly AddressNameRelation[]
  readonly protocolVersion: ProtocolVersion
}

const RELATION_LABELS: Readonly<Record<AddressNameRelation, string>> = {
  owner: 'Owner',
  manager: 'Manager',
  role_holder: 'Role holder',
  former_owner: 'Former owner',
}

export const relationLabels = (
  relations: readonly AddressNameRelation[],
): readonly string[] => relations.map((relation) => RELATION_LABELS[relation])

const HIDDEN_STATUSES: readonly NameSummary['registrationStatus'][] = [
  'released',
  'unregistered',
]

/** A name from bigname's current relations, or null for one the pages hide. */
export const toAddressNameItem = (
  summary: NameSummary,
): AddressNameItem | null =>
  summary.name.endsWith('.reverse') ||
  HIDDEN_STATUSES.includes(summary.registrationStatus)
    ? null
    : {
        name: summary.name,
        expiryDate: summary.expiresAt,
        graceEndDate: summary.graceEndsAt,
        status: summary.registrationStatus,
        subdomainCount: summary.subnameCount,
        recordCount: summary.recordCount,
        relations: summary.relations,
        protocolVersion: summary.protocol === 'v1' ? 'ENSv1' : 'ENSv2',
      }

/** A name the address held until it expired, in grace or price cooldown. */
export const toLapsedItem = (row: AddressName): AddressNameItem => ({
  name: row.name,
  // A subregistry can mint an expiry a Date cannot hold; it reads as none.
  expiryDate: toValidDate(toDate(row.expires_at)),
  graceEndDate: toValidDate(toDate(row.grace_ends_at)),
  status: row.status,
  relations: ['former_owner'],
  protocolVersion: row.authority === 'ens_v2' ? 'ENSv2' : 'ENSv1',
})

/** A name and every name above it, nearest first; any of them expiring stops its subnames resolving. */
export const getNamesAbove = (parentName: string): readonly string[] => {
  const labels = parentName.split('.')
  return Array.from({ length: labels.length - 1 }, (_, index) =>
    labels.slice(index).join('.'),
  )
}

/** The names a `.eth` name's subnames lapse with: the name and every name above it. Names outside `.eth` have none with an expiry. */
export const getEthNamesAbove = (
  name: string | undefined,
): readonly string[] => (name?.endsWith('.eth') ? getNamesAbove(name) : [])

/** The names above a `.eth` subname it lapses with: all of them for ENSv2, the 2LD for an undated ENSv1 one. */
export const ethAncestorsOf = ({
  name,
  expiryDate,
  protocolVersion,
}: Pick<
  AddressNameItem,
  'name' | 'expiryDate' | 'protocolVersion'
>): readonly string[] => {
  const labels = name.split('.')
  if (labels.length < 3 || labels.at(-1) !== 'eth') return []
  if (protocolVersion === 'ENSv1')
    return expiryDate ? [] : [labels.slice(-2).join('.')]
  return getNamesAbove(labels.slice(1).join('.'))
}

/** A name above a subname, and when it expires. */
type AncestorExpiry = { readonly name: string; readonly date: Date }

/** The name among `names` that expires first; null when one couldn't be read or none expires. */
export const getFirstToExpire = (
  names: readonly string[],
  expiryOf: ReadonlyMap<string, Date | null>,
): AncestorExpiry | null => {
  if (!names.every((name) => expiryOf.has(name))) return null
  return names.reduce<AncestorExpiry | null>((first, name) => {
    const date = expiryOf.get(name)
    return !date || (first && first.date <= date) ? first : { name, date }
  }, null)
}

/** The first name above a list's subnames to expire; `loading` until those dates are read. */
export type ParentExpiry =
  | { readonly status: 'loading' }
  | ({ readonly status: 'ready' } & Pick<
      AddressNameItem,
      'parentExpiryDate' | 'parentExpiryName'
    >)

/** Settles {@link ParentExpiry} from its reads; with no names above, there is nothing to wait for. */
export const toParentExpiry = ({
  isLoading,
  namesAbove,
  firstToExpire,
}: {
  readonly isLoading: boolean
  readonly namesAbove: readonly string[]
  readonly firstToExpire: AncestorExpiry | null
}): ParentExpiry =>
  match({ isLoading, namesAbove })
    .returnType<ParentExpiry>()
    .with({ isLoading: true }, () => ({ status: 'loading' }))
    .with({ namesAbove: [] }, () => ({ status: 'ready' }))
    .otherwise(() => ({
      status: 'ready',
      parentExpiryDate: firstToExpire?.date ?? null,
      parentExpiryName: firstToExpire?.name,
    }))

type ShownExpiryInput = {
  readonly expiryDate?: Date | null
  readonly parentExpiryDate?: Date | null
  readonly parentExpiryName?: string
}

/** What stops a name resolving first; `unread` lapses with a name above whose expiry couldn't be read. */
export type ResolvingExpiry =
  | { readonly type: 'own'; readonly date: Date }
  | { readonly type: 'parent'; readonly date: Date; readonly name?: string }
  | { readonly type: 'unread'; readonly date: null }
  | { readonly type: 'none'; readonly date: null }

/** The earlier of a name's own expiry and the first name above it to expire. */
export const getResolvingExpiry = (row: ShownExpiryInput): ResolvingExpiry =>
  match<ShownExpiryInput, ResolvingExpiry>(row)
    .with(
      { parentExpiryDate: P.instanceOf(Date) },
      ({ expiryDate, parentExpiryDate }) =>
        !expiryDate || parentExpiryDate < expiryDate,
      ({ parentExpiryDate, parentExpiryName }) => ({
        type: 'parent',
        date: parentExpiryDate,
        name: parentExpiryName,
      }),
    )
    .with({ expiryDate: P.instanceOf(Date) }, ({ expiryDate }) => ({
      type: 'own',
      date: expiryDate,
    }))
    .with({ parentExpiryDate: null }, () => ({ type: 'unread', date: null }))
    .otherwise(() => ({ type: 'none', date: null }))

/** The date a row shows and sorts by: when it stops resolving. */
export const getShownExpiry = (row: ShownExpiryInput): Date | null =>
  getResolvingExpiry(row).date

/** Whether the shown expiry falls in the range; a row with none never does. */
export const isShownExpiryInRange = (
  row: ShownExpiryInput,
  { from, to }: DateRange,
): boolean => {
  const expiryDate = getShownExpiry(row)
  if (!expiryDate) return false
  // The row shows the expiry's UTC day; the filter's dates are the viewer's calendar days.
  const day = unixSecondsToPlainDateUtc(Math.floor(expiryDate.getTime() / 1000))
  if (from && Temporal.PlainDate.compare(day, dateToPlainDate(from)) < 0)
    return false
  if (to && Temporal.PlainDate.compare(day, dateToPlainDate(to)) > 0)
    return false
  return true
}

/** Soonest shown expiry first; rows with none go last. */
export const byShownExpiry = (
  a: ShownExpiryInput,
  b: ShownExpiryInput,
): number => {
  const aExpiry = getShownExpiry(a)
  const bExpiry = getShownExpiry(b)
  if (!aExpiry && !bExpiry) return 0
  if (!aExpiry) return 1
  if (!bExpiry) return -1
  return aExpiry.getTime() - bExpiry.getTime()
}

/** One row per name, a current relation winning over a lapsed one, soonest expiry first. */
export const mergeAddressNames = (
  current: readonly AddressNameItem[],
  inGrace: readonly AddressNameItem[],
): AddressNameItem[] => {
  const listed = new Set(current.map(({ name }) => name))
  return [
    ...current,
    ...inGrace.filter(({ name }) => !listed.has(name)),
  ].toSorted(byShownExpiry)
}
