import {
  isPotentialFutureTargetDate,
  parseTargetCalendarDate,
} from '@/features/renew/utils/targetDate'

const months = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
]
const monthPattern = months.join('|')
const datePattern = new RegExp(
  `\\d{4}-\\d{2}-\\d{2}|(?:${monthPattern})\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,)?\\s+\\d{4}|\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${monthPattern})\\s+\\d{4}`,
  'gi',
)

const normalizeWrittenDate = (value: string): string | null => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value))
    return parseTargetCalendarDate(value) ? value : null
  const parts = value
    .toLowerCase()
    .replace(/(\d)(?:st|nd|rd|th)\b/g, '$1')
    .replaceAll(',', '')
    .split(/\s+/)
  const monthIndex = months.indexOf(parts[0] ?? '')
  const month = monthIndex >= 0 ? monthIndex : months.indexOf(parts[1] ?? '')
  if (month < 0) return null
  const day = Number(parts[monthIndex >= 0 ? 1 : 0])
  const year = Number(parts[2])
  const result = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return parseTargetCalendarDate(result) ? result : null
}

export type RenewalTargetDateSplit = {
  readonly selection: string
  readonly targetDate?: string
}

/** Remove one explicit renewal target, never a scheduled action or expiry filter. */
export const splitRenewalTargetDate = (
  query: string,
  now = new Date(),
): RenewalTargetDateSplit | null => {
  const masked = query.replace(/[^\s/@]+\.[^\s/@]+/gu, (name) =>
    ' '.repeat(name.length),
  )
  const matches = [...masked.matchAll(datePattern)]
  if (matches.length === 0)
    return /\b(?:until|through|to\s+(?:the\s+)?date|expir(?:e|es)\s+on)\b|\b\d{1,4}[/-]\d{1,2}[/-]\d{1,4}\b/i.test(
      // "Take these names through renewal" names the workflow, not a date.
      // Keep the original clause for the later full-request checks.
      masked.replace(/\bthrough\s+renewal[.!?]*\s*$/i, ''),
    )
      ? null
      : { selection: query }
  if (matches.length !== 1) return null
  const match = matches[0]
  if (!match) return null
  const prefix = masked.slice(0, match.index)
  const marker =
    /\b(?:until|through|to(?:\s+(?:the\s+)?(?:date|same\s+expir(?:y|ation)(?:\s+date)?(?:\s+(?:of|on))?))?|expir(?:e|es)\s+on)\s+$/i.exec(
      prefix,
    )
  if (!marker) return null
  const targetDate = normalizeWrittenDate(match[0])
  if (!targetDate || !isPotentialFutureTargetDate(targetDate, now)) return null
  const suffix = query.slice(match.index + match[0].length)
  // A time-of-day, timezone, or another date cannot be silently discarded.
  if (/^\s*(?:T\d|\d{1,2}:|(?:at|UTC|GMT|Z|[+-]\d)\b)/i.test(suffix))
    return null
  const main = query.slice(0, marker.index)
  const expiryOn = /^expir/i.test(marker[0])
  if (expiryOn && !/^\s*(?:please\s+)?make\s+/i.test(main)) return null
  if (!expiryOn && /\b(?:expir\w*|ending|due)\s*$/i.test(main)) return null
  const selection =
    `${expiryOn ? main.replace(/^(\s*(?:please\s+)?)make\s+/i, '$1Renew ') : main} ${suffix}`
      .replace(/\s+/g, ' ')
      .trim()
  return { selection, targetDate }
}
