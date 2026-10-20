import type { EventKind } from '@ens-apps/indexer/bigname'
import {
  type EventType,
  HISTORY_EVENT_TYPES,
  isKnownHistoryEventType,
  type TimelineEvent,
} from './timelineEvent'

/** Chip labels for bigname's history types. */
export const HISTORY_EVENT_TYPE_LABELS: Record<EventType, string> = {
  registration: 'Registration',
  renewal: 'Renewal',
  release: 'Release',
  expiry: 'Expiry',
  transfer: 'Transfer',
  authority: 'Registry owner',
  resolver: 'Resolver',
  record: 'Record',
  primary_name: 'Primary name',
  permission: 'Permission',
  subregistry: 'Subregistry',
  migration: 'Migration',
  reservation: 'Reservation',
  token: 'Token',
  contract: 'Contract',
}

/** The name-page facets, in bigname's vocabulary. */
export const OWNERSHIP_HISTORY_TYPES = [
  'registration',
  'renewal',
  'release',
  'expiry',
  'transfer',
  'authority',
  'permission',
  'migration',
  'reservation',
] as const satisfies readonly EventType[]

// Exhaustive over bigname's raw kinds, so a new kind fails the build here.
const EVENT_KINDS: Readonly<Record<EventKind, true>> = {
  RegistrationGranted: true,
  LabelRegistered: true,
  RegistrationRenewed: true,
  RegistrationReleased: true,
  ExpiryChanged: true,
  TokenControlTransferred: true,
  AuthorityTransferred: true,
  AuthorityEpochChanged: true,
  ResolverChanged: true,
  RecordChanged: true,
  RecordVersionChanged: true,
  ReverseChanged: true,
  PermissionChanged: true,
  RootPermissionChanged: true,
  PermissionScopeChanged: true,
  RolesChanged: true,
  EACRolesChanged: true,
  SubregistryChanged: true,
  MigrationApplied: true,
  AccountPermissionChanged: true,
  RegistrationReserved: true,
  ResolverRecordLinked: true,
  TokenRegenerated: true,
  RegistryCreated: true,
  ParentChanged: true,
  Upgraded: true,
}

const ROLE_CHANGE_KINDS: ReadonlySet<EventKind> = new Set([
  'PermissionChanged',
  'RootPermissionChanged',
  'RolesChanged',
  'EACRolesChanged',
  'AccountPermissionChanged',
])

/**
 * Every raw kind but role changes. `kind` intersects `type`, so with
 * `OWNERSHIP_HISTORY_TYPES` the `permission` rows left are the fuse changes
 * (`PermissionScopeChanged`), and role grants stay on the roles page.
 */
export const OWNERSHIP_HISTORY_KINDS: readonly EventKind[] = (
  Object.keys(EVENT_KINDS) as EventKind[]
).filter((kind) => !ROLE_CHANGE_KINDS.has(kind))

/** The ownership page's `permission` rows are only fuse changes. */
export const OWNERSHIP_TYPE_LABELS: Readonly<
  Partial<Record<EventType, string>>
> = { permission: 'Fuses' }

/** A `permission` row that sets NameWrapper fuses rather than granting roles. */
export const isFuseChange = (
  data:
    | { readonly powers?: unknown; readonly fuses?: number | null }
    | null
    | undefined,
): boolean => !data?.powers && data?.fuses != null

export const RESOLVER_HISTORY_TYPES = [
  'resolver',
  'record',
] as const satisfies readonly EventType[]

export const ADDRESS_RECORD_HISTORY_TYPES = [
  'record',
] as const satisfies readonly EventType[]

/**
 * Narrows `ADDRESS_RECORD_HISTORY_TYPES` to the address records (`addr:<coin>`)
 * and the name's own `name()` record. bigname's `record_key` filter takes one
 * exact key, not a family, so this runs over loaded rows. A reset
 * (`clearRecords`, no key) wipes the addresses too, so it stays.
 */
export const isAddressRecordEvent = (event: TimelineEvent): boolean => {
  // A row served without its payload cannot be placed, so it is not counted.
  if (event.type !== 'record' || !event.data) return false
  const { key } = event.data
  return key === undefined || key === 'name' || key.startsWith('addr:')
}

/**
 * A facet or chip selection as a positive set of bigname types, in canonical
 * order: every narrowing here is an intersection, which `type` expresses
 * directly (`exclude_type` is for removing a type from an unfaceted read).
 * Returns `undefined` for "no narrowing", and `[]` when nothing in `types` is a
 * bigname type.
 */
export const toHistoryEventTypes = (
  types: readonly string[] | undefined,
): readonly EventType[] | undefined => {
  if (!types) return undefined
  const wanted = new Set(types.filter(isKnownHistoryEventType))
  return HISTORY_EVENT_TYPES.filter((type) => wanted.has(type))
}
