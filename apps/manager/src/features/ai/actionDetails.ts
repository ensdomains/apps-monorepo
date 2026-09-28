import { MAX_DURATION_YEARS } from '@/features/register-v2/utils/time'
import {
  getQuantityCandidates,
  hasInvalidQuantitySyntax,
} from '@/utils/naturalLanguageQuantity'

export { getQuantityCandidates } from '@/utils/naturalLanguageQuantity'

/** Validate the raw choice without inventing confidence or changing its vote. */
export const inspectDetailChoice = <T extends string>(
  answer: unknown,
  allowed: readonly T[],
): { readonly choice: T; readonly confidence: number } | null => {
  if (typeof answer !== 'object' || answer === null || Array.isArray(answer))
    return null
  const record = answer as Record<string, unknown>
  return record.type === 'choice' &&
    typeof record.choice === 'string' &&
    allowed.includes(record.choice as T) &&
    typeof record.confidence === 'number' &&
    Number.isFinite(record.confidence) &&
    record.confidence >= 0 &&
    record.confidence <= 1
    ? { choice: record.choice as T, confidence: record.confidence }
    : null
}

export const readDetailChoice = <T extends string>(
  answers: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
): T | null => {
  const answer = inspectDetailChoice(answers[key], allowed)
  return answer && answer.confidence >= 0.65 ? answer.choice : null
}

export const buildJevActionDetailQuestions = (
  query: string,
  names: readonly string[],
) => ({
  request_mode: {
    type: 'choice',
    instructions:
      'Classify whether the user asks to DO something or explicitly forbids it. This is about instruction polarity, not missing information or eligibility. Read-only requests to show, list, find, view, open, or inspect names ARE requested actions. "Show [ENS_NAME]", "Open the profile", "Which names do I own?", and "List names in grace" all mean requested. Polite questions and typos (can I get, could u, plz, opn) are requests. "Register [ENS_NAME]" without a duration is requested; the app will ask for missing details. "Do not renew" and "never favourite" are negated. Excluding a subset (names without manager restoration, except favourites) or replacing an old profile value does not negate the requested action. Turning off/muting notifications requests disabling them. Removing an email or Telegram notification contact, un-starring/unfavouriting a name, disabling browser notifications, resending verification, revoking an approval, and disconnecting a wallet are affirmative requested operations. A removal verb does not mean the user forbids the operation. Choose unclear only for conflicting instructions about performing the same action, not ordinary questions or missing details.',
    criteria: {
      requested:
        'An affirmative request, including read-only search/navigation and requests whose missing details can be clarified.',
      negated:
        'An explicit prohibition: the user says not to perform the action.',
      unclear:
        'Conflicting directions about performing versus not performing the same action.',
    },
  },
  action_count: {
    type: 'choice',
    instructions:
      'Count distinct Manager operations, not the number of names or details. Renewing or migrating an exact list joined by and is ONE action even for several names. A renewal duration, expiry filter, ordering, and opening a profile to edit one field belong to ONE action. Editing two fields is more than one action. Preserve the order requested.',
    criteria: {
      one: 'One action.',
      two: 'Two actions.',
      many: 'Three or more actions.',
    },
  },
  ...(names.length > 1
    ? {
        target_name: {
          type: 'choice',
          instructions:
            'Which exact name is the target of the FIRST action? Names are replaced by ordered placeholders. Choose ambiguous for alternatives, conflicting targets or uncertainty. "alice, not bob" is a correction to alice; "alice or bob" is ambiguous. Never choose an arbitrary first name.',
          criteria: {
            ...Object.fromEntries(
              names.map((_, index) => [
                `name_${index + 1}`,
                `Name placeholder ${index + 1}, ${index === 0 ? '[ENS_NAME]' : `[ENS_NAME_${index + 1}]`}.`,
              ]),
            ),
            ambiguous: 'The first target needs clarification.',
          },
        },
      }
    : {}),
  duration_unit: {
    type: 'choice',
    instructions:
      'For the first registration or renewal action, what unit of additional duration is requested? Accept typos and shorthand such as dys, wks, yrs. The phrase 90 more days or 10 extra days means DAYS; more is an additional-duration word, not an unsupported unit. Likewise another year means one year. Do not confuse an expiry-search window or a reminder schedule with renewal duration. An explicit renewal target date is not a relative unit: choose missing for it; Manager parses the exact date locally.',
    criteria: {
      days: 'Days.',
      weeks: 'Weeks.',
      years: 'Years.',
      missing: 'No unit supplied.',
      unsupported:
        'Months, fractional units, or another unsupported relative unit. An explicit full target expiry date uses missing instead.',
    },
  },
  duration_purpose: {
    type: 'choice',
    instructions:
      'What does a mentioned time period mean for the FIRST action? "keep it for 10 more days", "extnd ... fr anothr 10 days" and "add ten days" mean additional duration. "renew in 10 days", "renew within 10 days", and "renew after two years" are scheduling/deadline instructions, not added time. In contrast, renew until/through/to a full calendar date or make names expire on that date requests a supported target expiry date; choose target_date.',
    criteria: {
      added: 'Length of registration or additional renewal time.',
      target_date:
        'Explicit calendar date that renewed names should expire on, not a schedule to execute later.',
      scheduled: 'A time or deadline to perform an action later.',
      search: 'Expiry search window.',
      missing: 'No duration requested.',
      ambiguous: 'Unclear or competing durations.',
    },
  },
  duration_amount: {
    type: 'choice',
    instructions:
      'Select the supplied quantity for the FIRST registration or renewal duration. Use only the exact extracted candidate. If multiple competing quantities cannot be resolved unambiguously, choose ambiguous. Never invent a number.',
    criteria: {
      ...Object.fromEntries(
        getQuantityCandidates(query)
          .filter(({ value }) => Number.isSafeInteger(value) && value > 0)
          .map(({ id, value }) => [id, `The supplied quantity ${value}.`]),
      ),
      missing: 'No quantity supplied.',
      ambiguous: 'Several competing or unclear quantities.',
    },
  },
  notification_preference: {
    type: 'choice',
    instructions:
      'Which single existing notification preference is requested? Understand favourite, favorite, starred names, owned/my names, ENS news/updates and common typos. If no specific preference or more than one preference is requested, choose unclear.',
    criteria: {
      favouritedNameExpiry: 'Favourite name expiry reminders.',
      ownedNameExpiry: 'Owned name expiry reminders.',
      ensLabsUpdates: 'ENS Labs news and updates.',
      unclear: 'Missing, ambiguous, multiple, or not a notification request.',
    },
  },
  notification_operation: {
    type: 'choice',
    instructions:
      'Should the requested notification preference be enabled or disabled? Mute, silence, stop sending, unsubscribe, switch off and turn off disable. Unmute, resume, restart, enable, subscribe, turn on enable. Do not default to enabled if the request is unclear. "Do not turn on" is not a request to turn on. Removing a contact method, resending verification, un-starring a favourite, and disabling browser push are requested actions too.',
    criteria: {
      enable: 'Enable the selected preference.',
      disable: 'Disable the selected preference.',
      unclear: 'No clear on/off change or contradictory instructions.',
    },
  },
})

export type ActionDuration = {
  readonly targetDate?: string
  readonly durationDays?: number
  readonly durationYears?: number
  readonly durationUnitRequested?: boolean
  readonly durationAmount?: number
}

const durationUnits = [
  'days',
  'weeks',
  'years',
  'missing',
  'unsupported',
] as const
const durationPurposes = [
  'added',
  'scheduled',
  'target_date',
  'search',
  'missing',
  'ambiguous',
] as const

const getDurationChoices = (
  query: string,
  answers?: Record<string, unknown>,
) => {
  const candidates = getQuantityCandidates(query)
  return {
    candidates,
    purpose:
      answers &&
      readDetailChoice(answers, 'duration_purpose', durationPurposes),
    amount:
      answers &&
      readDetailChoice(answers, 'duration_amount', [
        ...candidates.map(({ id }) => id),
        'missing',
        'ambiguous',
      ]),
    unit: answers && readDetailChoice(answers, 'duration_unit', durationUnits),
  }
}

const isScheduledDuration = (query: string) =>
  getQuantityCandidates(query).some(({ index }) =>
    /\b(?:in|within|after|before|on|until)\s+(?:the\s+next\s+)?$/i.test(
      query.slice(0, index),
    ),
  )

const literalDurationUnit = (query: string) => {
  const matches = [
    ...query.matchAll(/\b(days?|dys?|weeks?|wks?|years?|yrs?|months?)\b/gi),
  ]
  if (matches.some((match) => /^month/i.test(match[0]))) return 'unsupported'
  if (matches.length !== 1) return undefined
  const first = matches[0]?.[0].toLowerCase()
  if (first?.startsWith('d')) return 'days'
  if (first?.startsWith('w')) return 'weeks'
  if (first?.startsWith('y')) return 'years'
  return undefined
}

const hasAddedDurationCue = (
  query: string,
  candidate: ReturnType<typeof getQuantityCandidates>[number],
) => {
  const prefix = query.slice(0, candidate.index)
  const suffix = query.slice(candidate.index + candidate.text.length)
  return (
    /\b(?:for|by|another|extra|additional|add)\s+(?:(?:another|an?\s+(?:extra|additional))\s+)?$/i.test(
      prefix,
    ) ||
    /^\s+(?:more|extra|additional)\s+(?:days?|weeks?|years?)\b/i.test(suffix)
  )
}

const makeDuration = (
  amount: number,
  unit: string | null | undefined,
): ActionDuration | null => {
  if (!unit || unit === 'missing')
    return { durationUnitRequested: true, durationAmount: amount }
  if (unit === 'years')
    return amount <= MAX_DURATION_YEARS ? { durationYears: amount } : null
  const days = amount * (unit === 'weeks' ? 7 : 1)
  return days <= Math.ceil(MAX_DURATION_YEARS * 365.25)
    ? { durationDays: days }
    : null
}

const correctedDurationQuery = (query: string): string => {
  const separator = /\b(?:instead\s+of|rather\s+than)\s+/i.exec(query)
  if (!separator) return query
  const before = query.slice(0, separator.index)
  const after = query.slice(separator.index + separator[0].length)
  const old = getQuantityCandidates(after)
  if (getQuantityCandidates(before).length !== 1 || old.length !== 1)
    return query
  const candidate = old[0]
  if (
    candidate?.index !== 0 ||
    !/^\s+(?:days?|weeks?|years?)[.!?]?$/i.test(
      after.slice(candidate.text.length),
    )
  )
    return query
  return before.trim()
}

export const parseSemanticDuration = (
  originalQuery: string,
  answers?: Record<string, unknown>,
): ActionDuration | null => {
  const query = correctedDurationQuery(originalQuery)
  const {
    candidates,
    purpose,
    amount,
    unit: selectedUnit,
  } = getDurationChoices(query, query === originalQuery ? answers : undefined)
  const literalUnit = literalDurationUnit(query)
  if (
    candidates.some(
      ({ value }) => !Number.isSafeInteger(value) || value <= 0,
    ) ||
    hasInvalidQuantitySyntax(query, candidates) ||
    isScheduledDuration(query) ||
    literalUnit === 'unsupported' ||
    selectedUnit === 'unsupported' ||
    purpose === 'scheduled' ||
    purpose === 'target_date' ||
    purpose === 'search'
  )
    return null
  if (
    candidates.length > 1 ||
    purpose === 'ambiguous' ||
    amount === 'ambiguous'
  )
    return null
  const candidate = candidates[0]
  if (!candidate) return {}
  if (
    literalUnit &&
    selectedUnit &&
    selectedUnit !== 'missing' &&
    selectedUnit !== literalUnit
  )
    return null
  if (!hasAddedDurationCue(query, candidate) && purpose !== 'added') return null
  return makeDuration(candidate.value, literalUnit ?? selectedUnit)
}

export const hasNegatedAction = (query: string): boolean =>
  /\b(?:do\s+not|don['’]?t|dont|never|not\s+to)\s+(?:please\s+)?(?:renew|extend|register|favo[u]?rite|star|set|change|edit|upgrade|migrate|turn|switch|enable|disable|mute|stop|remove|delete|unstar|unfavou?rite|disconnect|resend|share|copy|revoke|download|claim|mint)\b/i.test(
    query,
  )
