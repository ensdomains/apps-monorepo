import type { BaseEvent } from '@/components/table/EventsDataTable'

/**
 * One ENS event in the events table: an ENSv1-subgraph-shaped event, or a
 * bigname history row converted by `historyEventsToSubgraphEvents`.
 */
export type ENSEvent = BaseEvent<Record<string, unknown>>
