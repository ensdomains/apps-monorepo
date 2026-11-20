import { vi } from 'vitest'

/** Makes `Date`'s local calendar getters read as a viewer in `timeZone` sees them. */
export const mockTimeZone = (timeZone: string): void => {
  const local = (date: Date) =>
    Temporal.Instant.fromEpochMilliseconds(date.getTime()).toZonedDateTimeISO(
      timeZone,
    )
  vi.spyOn(Date.prototype, 'getFullYear').mockImplementation(function (
    this: Date,
  ) {
    return local(this).year
  })
  vi.spyOn(Date.prototype, 'getMonth').mockImplementation(function (
    this: Date,
  ) {
    return local(this).month - 1
  })
  vi.spyOn(Date.prototype, 'getDate').mockImplementation(function (this: Date) {
    return local(this).day
  })
}
