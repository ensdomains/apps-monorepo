/** Formats the grace-end instant in the viewer's locale and time zone. */
export const formatGraceEndDateTime = ({
  date,
  locale,
  timeZone,
}: {
  readonly date: Date
  readonly locale: string
  readonly timeZone: string
}): string => {
  if (Number.isNaN(date.getTime())) return '—'

  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
    timeZoneName: 'longOffset',
  })
    .formatToParts(date)
    .map((part) =>
      part.type === 'timeZoneName'
        ? part.value === 'GMT'
          ? 'UTC+00:00'
          : part.value.replace('GMT', 'UTC')
        : part.value,
    )
    .join('')
}
