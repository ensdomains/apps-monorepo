import { namehash } from 'viem'
import type {
  EventsQuery,
  HistoryEvent,
  HistoryEventKind,
  HistoryEventType,
} from '../reads/history.types'
import { toUnixSeconds } from '../shared/values'
import { toZigensTypes, toZigensTypesForKinds } from './history'

/** The filters every history read takes, besides its subject. */
export type HistoryFilter = Readonly<{
  types?: readonly HistoryEventType[]
  kinds?: readonly HistoryEventKind[]
  recordKey?: string
  from?: Date
  to?: Date
}>

/** The registration a `registrationId` names: its node and when it began. */
export type RegistrationAnchor = Readonly<{
  namehash: string
  registeredAt: Date | null
}>

/** The later of two lower bounds; either may be absent. */
export const laterOf = (
  a: Date | null | undefined,
  b: Date | null | undefined,
): Date | undefined => (a && b ? (a > b ? a : b) : (a ?? b ?? undefined))

const intersect = (
  a: readonly string[] | undefined,
  b: readonly string[] | undefined,
) => (a && b ? a.filter((value) => b.includes(value)) : (a ?? b))

/** zigens `EventFilter` terms for types, kinds, a record key and a time window; null when no zigens type can match. */
export const toEventWhere = (filter: HistoryFilter) => {
  const types = filter.recordKey ? (['record'] as const) : filter.types
  const zigensTypes = intersect(
    types?.length ? toZigensTypes(types) : undefined,
    filter.kinds?.length ? toZigensTypesForKinds(filter.kinds) : undefined,
  )
  if (zigensTypes?.length === 0) return null
  // Root changes alone narrow to the root resource; mixed with other kinds, the row filter splits them.
  const isRootOnly =
    !!filter.kinds?.length &&
    filter.kinds.every((kind) => kind === 'RootPermissionChanged')
  return {
    ...(zigensTypes && { type_in: zigensTypes }),
    ...(isRootOnly && { resource: '0x0' }),
    // zigens takes unix seconds as a GraphQL Int.
    ...(filter.from && { timestamp_gte: Number(toUnixSeconds(filter.from)) }),
    ...(filter.to && { timestamp_lte: Number(toUnixSeconds(filter.to)) }),
  }
}

/** zigens `EventFilter` for an events read; null when its exact filters contradict, so the page is empty. */
export const toEventsWhere = (
  query: EventsQuery,
  registration: RegistrationAnchor | null,
): Readonly<Record<string, unknown>> | null => {
  const node = query.name === undefined ? undefined : namehash(query.name)
  const contract = query.resolver ?? query.contractAddress
  const isConflicting =
    (query.registrationId !== undefined && registration === null) ||
    (node !== undefined &&
      registration !== null &&
      node !== registration.namehash.toLowerCase()) ||
    (query.resolver !== undefined &&
      query.contractAddress !== undefined &&
      query.resolver.toLowerCase() !== query.contractAddress.toLowerCase())
  const base = toEventWhere({
    ...query,
    from: laterOf(query.from, registration?.registeredAt),
  })
  if (isConflicting || base === null) return null
  return {
    ...base,
    ...((registration?.namehash ?? node) && {
      namehash: registration?.namehash ?? node,
    }),
    ...(query.address && { involved: query.address.toLowerCase() }),
    // zigens lists the events a resolver emitted, not names pointed at it.
    ...(contract && { contractAddress: contract.toLowerCase() }),
  }
}

/** Whether a filter can match rows of `type`. */
export const canMatchType = (filter: HistoryFilter, type: HistoryEventType) =>
  !filter.types?.length || filter.types.includes(type)

/** Whether a row passes the filters (ENSNode relies on this); a row with no timestamp is outside any window. */
export const isWithinHistoryFilter =
  (filter: HistoryFilter) =>
  (event: HistoryEvent): boolean =>
    canMatchType(filter, event.type) &&
    (!filter.kinds?.length ||
      (event.kind !== null &&
        filter.kinds.some((kind) => kind === event.kind))) &&
    (filter.recordKey === undefined ||
      (event.type === 'record' && event.data.key === filter.recordKey)) &&
    (!(filter.from || filter.to) ||
      (event.timestamp !== null &&
        (!filter.from || event.timestamp >= filter.from) &&
        (!filter.to || event.timestamp <= filter.to)))

/** Where a name's history starts: with `scope: 'registration'`, no earlier than its current registration. */
export const toHistoryStart = (
  query: Readonly<{ scope?: 'name' | 'registration' | 'both'; from?: Date }>,
  registeredAt: Date | null,
): Date | undefined =>
  query.scope === 'registration'
    ? laterOf(query.from, registeredAt)
    : query.from
