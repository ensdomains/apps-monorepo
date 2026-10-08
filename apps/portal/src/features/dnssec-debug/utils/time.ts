/** RFC 1982 serial number comparison, as RRSIG validity windows require. */
export const serialGte = (a: number, b: number): boolean => ((a - b) | 0) >= 0

const UNITS: readonly (readonly [Intl.RelativeTimeFormatUnit, number])[] = [
  ['year', 365 * 24 * 60 * 60],
  ['month', 30 * 24 * 60 * 60],
  ['day', 24 * 60 * 60],
  ['hour', 60 * 60],
  ['minute', 60],
]

const relativeFormat = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

/** "in 3 days", "5 hours ago" — `timestamp` and `now` in unix seconds. */
export const formatRelativeTime = (timestamp: number, now: number): string => {
  const delta = timestamp - now
  const [unit, size] = UNITS.find(
    ([, seconds]) => Math.abs(delta) >= seconds,
  ) ?? ['second', 1]
  return relativeFormat.format(Math.round(delta / size), unit)
}

/** "2026-10-22 00:00 UTC" — DNS tooling speaks UTC. */
export const formatUtc = (timestamp: number): string =>
  `${new Date(timestamp * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC`
