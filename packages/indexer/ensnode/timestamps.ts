import type { V1Event } from './ensnode.types'

/** A `NameRegistered` row as `LATEST_REGISTRATIONS` returns it, newest first. */
export type RegisteredRow = Readonly<{
  id: string
  registrationId: string
  registration: Readonly<{ registrationDate: string }> | null
}>

/** The registrations a page's `NameRegistered` events belong to. */
export const toRegistrationIds = (
  events: readonly V1Event[],
): readonly string[] => [
  ...new Set(
    events.flatMap((event) =>
      event.__typename === 'NameRegistered' &&
      typeof event.registrationId === 'string'
        ? [event.registrationId]
        : [],
    ),
  ),
]

/**
 * `registrationDate` is when the latest `NameRegistered` of a registration
 * happened, so only that event, the first row per registration, gets it.
 */
export const toRegistrationTimes = (
  rows: readonly RegisteredRow[],
): ReadonlyMap<string, bigint> =>
  new Map(
    rows
      .filter(
        (row, index) =>
          rows.findIndex(
            ({ registrationId }) => registrationId === row.registrationId,
          ) === index,
      )
      .flatMap((row) =>
        row.registration
          ? [[row.id, BigInt(row.registration.registrationDate)] as const]
          : [],
      ),
  )

/** The blocks whose timestamps the registration dates did not cover. */
export const toMissingBlocks = (
  events: readonly V1Event[],
  known: ReadonlyMap<string, bigint>,
): readonly number[] => [
  ...new Set(
    events
      .filter((event) => !known.has(event.id))
      .map((event) => event.blockNumber),
  ),
]

/** Each event's unix seconds, from its registration date or its block; absent when neither is known. */
export const toEventTimes = (
  events: readonly V1Event[],
  registrationTimes: ReadonlyMap<string, bigint>,
  blockTimes: ReadonlyMap<number, bigint>,
): ReadonlyMap<string, bigint> =>
  new Map(
    events.flatMap((event) => {
      const seconds =
        registrationTimes.get(event.id) ?? blockTimes.get(event.blockNumber)
      return seconds === undefined ? [] : [[event.id, seconds] as const]
    }),
  )
