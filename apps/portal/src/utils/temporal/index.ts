/**
 * UI boundary adapters — convert between Temporal types and native Date objects.
 *
 * The rest of the app uses Temporal types natively (Temporal.Instant for absolute
 * moments, Temporal.PlainDate for calendar dates). Only convert to Date where
 * external libraries require it (react-day-picker, Intl formatters).
 */

/** Convert a Temporal.Instant to a Date for react-day-picker or Intl APIs. */
export const instantToDate = (instant: Temporal.Instant): Date =>
  new Date(instant.epochMilliseconds)

/** Convert a Date received from react-day-picker callbacks to Temporal.Instant. */
export const dateToInstant = (date: Date): Temporal.Instant =>
  Temporal.Instant.fromEpochMilliseconds(date.valueOf())

/** Convert a Temporal.PlainDate to a Date for react-day-picker month/selection props. */
export const plainDateToDate = (plain: Temporal.PlainDate): Date =>
  new Date(plain.year, plain.month - 1, plain.day)

/** Convert a Date from react-day-picker's disabled callback to Temporal.PlainDate. */
export const dateToplainDate = (date: Date): Temporal.PlainDate =>
  Temporal.PlainDate.from({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  })
