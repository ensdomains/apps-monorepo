/**
 * Formats an extension as the calendar span from the name's current expiry to
 * its new one, e.g. "1 year 1 day".
 *
 * Not `formatRegistrationDuration`: dividing seconds by a 365.25-day contract
 * year absorbs up to 23h of slack, so a span one day past a whole-year target
 * printed the same as the target itself — picking Aug 7 instead of Aug 6 moved
 * the price and the new expiry but left the extension reading "1 year".
 */
export const formatExtensionPeriod = (
  baseDate: Temporal.PlainDate,
  newExpiryDate: Temporal.PlainDate,
): string => {
  const { years, months, days } = baseDate.until(newExpiryDate, {
    largestUnit: 'year',
  })

  // A Feb 29 expiry constrains to Feb 28 a year on, which `until` reports as
  // "11 months 30 days". That IS the whole-year target for such a name.
  const constrainedYears = years + 1
  if (
    (months > 0 || days > 0) &&
    Temporal.PlainDate.compare(
      baseDate.add({ years: constrainedYears }),
      newExpiryDate,
    ) === 0
  ) {
    return `${constrainedYears} year${constrainedYears === 1 ? '' : 's'}`
  }

  const parts = [
    [years, 'year'],
    [months, 'month'],
    [days, 'day'],
  ] as const

  return (
    parts
      .filter(([value]) => value > 0)
      .map(([value, unit]) => `${value} ${unit}${value === 1 ? '' : 's'}`)
      .join(' ') || '0 days'
  )
}
