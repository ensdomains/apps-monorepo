import { hasInvalidQuantitySyntax } from '@/utils/naturalLanguageQuantity'
import {
  type ActionDuration,
  getQuantityCandidates,
  parseSemanticDuration,
  readDetailChoice,
} from './actionDetails'
import { splitRenewalTargetDate } from './renewalTargetDateIntent'

type Quantity = ReturnType<typeof getQuantityCandidates>[number]
type DurationSpan = {
  readonly start: number
  readonly end: number
  readonly duration: ActionDuration
}

const unitPattern =
  /^\s*(?:(?:more|extra|additional)\s+)?(days?|dys?|weeks?|wks?|years?|yrs?|months?|hours?|minutes?|seconds?)\b/i
const addedCue =
  /\b(?:for|by|another|add|extra|additional|plus|fr)\s+(?:another\s+)?$/i
const windowCue =
  /\b(?:within|next|in|before|after|until)\s+(?:the\s+next\s+)?$/i
const expiryCue = /\b(?:expir\w*|due|grace|ending|ends?)\b/i
const unsupportedUnit = /^(?:month|hour|minute|second)/i

const classifyQuantity = (
  query: string,
  quantity: Quantity,
  answers: Record<string, unknown>,
): DurationSpan | 'window' | null => {
  const prefix = query.slice(0, quantity.index)
  const suffix = query.slice(quantity.index + quantity.text.length)
  if (
    !Number.isSafeInteger(quantity.value) ||
    quantity.value <= 0 ||
    /(?:[-−﹣－]\s*|\b(?:minus|negative)\s+)$/i.test(prefix)
  )
    return null
  const unit = unitPattern.exec(suffix)
  if (unit?.[1] && unsupportedUnit.test(unit[1])) return null
  // A requested count of names is not an omitted renewal-time unit.
  if (!unit && /^\s+(?:names?|domains?)\b/i.test(suffix)) return null
  const added = addedCue.exec(prefix)
  const remaining =
    unit &&
    /^\s*(?:left|remaining|from\s+now|of\s+expir(?:ing|y|ation))\b/i.test(
      suffix.slice(unit[0].length),
    )
  const purpose = readDetailChoice(answers, 'duration_purpose', [
    'added',
    'scheduled',
    'search',
    'missing',
    'ambiguous',
  ])
  if (
    !added &&
    unit &&
    (remaining ||
      (/\b(?:within|next|in)\s+(?:the\s+next\s+)?$/i.test(prefix) &&
        expiryCue.test(prefix)))
  )
    return 'window'
  if (windowCue.test(prefix)) return null // A schedule is not added time.
  if (!added && purpose === 'search' && unit && expiryCue.test(query))
    return 'window'
  if (!added && purpose === 'scheduled') return null
  if (!unit && !added && purpose !== 'added') return null
  // A supplied but unsupported unit is not the same as an omitted unit.
  if (
    !unit &&
    /^\s+[a-z]+\b/i.test(suffix) &&
    !/^\s+(?:sorted|ordered|and|with|my|the|names|domains)\b/i.test(suffix)
  )
    return null
  const fragment = `${quantity.text}${unit?.[0] ?? ''}`
  const duration = parseSemanticDuration(`renew for ${fragment}`)
  if (!duration) return null
  return {
    start: added?.index ?? quantity.index,
    end: quantity.index + quantity.text.length + (unit?.[0].length ?? 0),
    duration,
  }
}

/** Remove only the added-time span; retain expiry windows and sorting for filters. */
const expandCompactDurations = (query: string): string => {
  const masked = query.replace(/\S*[.@]\S*/g, (value) =>
    ' '.repeat(value.length),
  )
  const matches = [
    ...masked.matchAll(
      /(?<![\p{L}\p{N}_.])(?:(for|by|another))?(\d+)(days?|dys?|weeks?|wks?|years?|yrs?|d|w|y)(?![\p{L}\p{N}_.])/giu,
    ),
  ]
  return matches.reverse().reduce((text, match) => {
    const unit = match[3]?.toLowerCase()
    const expandedUnit =
      unit === 'd'
        ? 'days'
        : unit === 'w'
          ? 'weeks'
          : unit === 'y'
            ? 'years'
            : unit
    const value = `${match[1] ? `${match[1]} ` : ''}${match[2]} ${expandedUnit}`
    return `${text.slice(0, match.index)}${value}${text.slice(match.index + match[0].length)}`
  }, query)
}

export const splitBulkSelectionDuration = (
  originalQuery: string,
  answers: Record<string, unknown> = {},
): { readonly selection: string; readonly duration: ActionDuration } | null => {
  const target = splitRenewalTargetDate(originalQuery)
  if (!target) return null
  const query = expandCompactDurations(target.selection)
  const quantities = getQuantityCandidates(query)
  if (hasInvalidQuantitySyntax(query, quantities)) return null
  const added: DurationSpan[] = []
  for (const quantity of quantities) {
    const classified = classifyQuantity(query, quantity, answers)
    if (!classified) return null
    if (classified !== 'window') added.push(classified)
  }
  if (added.length > 1) return null
  const duration = added[0]
  if (target.targetDate) {
    if (
      duration ||
      (quantities.length === 0 &&
        /\b(?:days?|weeks?|years?|months?|hours?|minutes?|seconds?)\b/i.test(
          query.replace(/\S*[.@]\S*/g, ''),
        ))
    )
      return null
    return { selection: query, duration: { targetDate: target.targetDate } }
  }
  if (!duration) {
    // A request that supplies a time unit but omits its number must clarify.
    if (
      /\b(?:for|by|another)\s+(?:months?|hours?|minutes?|seconds?)\b/i.test(
        query,
      )
    )
      return null
    const missingAmount =
      /\b(?:for|by|another)\s+(?:[a-z-]+\s+){0,3}(?:days?|weeks?|years?)\b/i.exec(
        query,
      )
    if (missingAmount)
      return {
        selection:
          `${query.slice(0, missingAmount.index)} ${query.slice(missingAmount.index + missingAmount[0].length)}`
            .replace(/\s+/g, ' ')
            .trim(),
        duration: { durationUnitRequested: true },
      }
    if (
      quantities.length === 0 &&
      /\b(?:days?|weeks?|years?|months?|hours?|minutes?|seconds?)\b/i.test(
        query.replace(/\S*[.@]\S*/g, ''),
      )
    )
      return null
    return { selection: query, duration: {} }
  }
  return {
    selection: `${query.slice(0, duration.start)} ${query.slice(duration.end)}`
      .replace(/\s+/g, ' ')
      .replace(/\s+([,;])/g, '$1')
      .trim(),
    duration: duration.duration,
  }
}
