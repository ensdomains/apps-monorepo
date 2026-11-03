import { match } from 'ts-pattern'

/** Formats the grace-end instant in the viewer's locale and time zone. */
export const formatGraceEndDateTime = ({
  date,
  locale,
  timeZone,
}: {
  readonly date: Date | null | undefined
  readonly locale: string
  readonly timeZone: string
}): string => {
  if (date == null || Number.isNaN(date.getTime())) return '—'

  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZone,
    timeZoneName: 'longOffset',
  })
    .formatToParts(date)
    .map((part) =>
      match(part)
        .with({ type: 'timeZoneName', value: 'GMT' }, () => 'UTC+00:00')
        .with({ type: 'timeZoneName' }, ({ value }) =>
          value.replace('GMT', 'UTC'),
        )
        .otherwise(({ value }) => value),
    )
    .join('')
}
