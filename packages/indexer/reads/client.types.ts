import type { ResultAsync } from 'neverthrow'
import type { AuditedPage, Page, ReadOptions } from './common.types'
import type { IndexerReadError } from './errors'
import type {
  AddressHistoryQuery,
  EventsQuery,
  HistoryEvent,
  NameHistoryQuery,
} from './history.types'
import type { NameDetail, NameDetailQuery } from './nameDetail.types'
import type {
  GraceNamesQuery,
  LapsedNamesQuery,
  NamesQuery,
  NamesResult,
  Subname,
  SubnamesQuery,
} from './names.types'
import type { NameSummary, NamesForAddressQuery } from './namesForAddress.types'
import type { RecordKeys, RecordKeysQuery } from './records.types'
import type {
  PermissionsQuery,
  Registry,
  RegistryLabel,
  RegistryLabelsQuery,
  RegistryQuery,
  ResolverCollectionQuery,
  ResolverLink,
  ResolverOverview,
  ResolverQuery,
  ResolverRoleGrant,
  RootRoleGrants,
  SyncStatus,
} from './registry.types'

type Read<Query, Result> = (
  query: Query,
  options?: ReadOptions,
) => ResultAsync<Result, IndexerReadError>

/** Every indexer read the apps make, in backend-neutral types; bigname, Goldsky and zigens each implement it. */
export type IndexerClient = Readonly<{
  /** Null when the name is not indexed at all. */
  getNameDetail: Read<NameDetailQuery, NameDetail | null>
  /** Null for a name the backend has not indexed or could not fully read. */
  getNames: Read<NamesQuery, NamesResult>
  getNamesForAddress: Read<NamesForAddressQuery, Page<NameSummary>>
  /** Every ENSv2 `.eth` name the address held and can still renew in grace. */
  getGraceNames: Read<GraceNamesQuery, readonly NameSummary[]>
  /** `.eth` names in either era the address held until they lapsed, and nobody has registered since. */
  getLapsedNames: Read<LapsedNamesQuery, readonly NameSummary[]>
  /** An unindexed parent reads as an empty page. */
  getSubnames: Read<SubnamesQuery, Page<Subname>>
  /** Null when the name is not indexed. */
  getRecordKeys: Read<RecordKeysQuery, RecordKeys | null>
  /** Null when the name is not indexed. */
  getNameHistory: Read<NameHistoryQuery, Page<HistoryEvent> | null>
  getAddressHistory: Read<AddressHistoryQuery, Page<HistoryEvent>>
  getEvents: Read<EventsQuery, Page<HistoryEvent>>
  /** Null when the registry is not indexed. */
  getRegistry: Read<RegistryQuery, Registry | null>
  /** Null when the registry is not indexed. */
  getRegistryLabels: Read<RegistryLabelsQuery, Page<RegistryLabel> | null>
  /** Null when the resolver is not indexed. */
  getResolver: Read<ResolverQuery, ResolverOverview | null>
  getResolverLinks: Read<ResolverCollectionQuery, AuditedPage<ResolverLink>>
  getResolverRoles: Read<
    ResolverCollectionQuery,
    AuditedPage<ResolverRoleGrant>
  >
  /** A registry's root role holders. */
  getPermissions: Read<PermissionsQuery, RootRoleGrants>
  getSyncStatus: Read<void, SyncStatus>
}>
