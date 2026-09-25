import { normalize } from 'viem/ens'
import {
  buildJevNameSearchRequest,
  parseJevNameSearchResponse,
} from '@/features/dashboard/service/jevNameSearch'
import type { SmartNameFilters } from '@/features/dashboard/smartNameSearch'
import type { JevFailureStatus } from './jevBoundary'

export type AiIntent =
  | 'set_primary'
  | 'register'
  | 'renew'
  | 'find_names'
  | 'bulk_renew'
  | 'migrate'
  | 'edit_profile'
  | 'notification'
  | 'favorite'
  | 'view_name'

export type AiAction =
  | { readonly intent: 'set_primary'; readonly name?: string }
  | {
      readonly intent: 'register'
      readonly name?: string
      readonly durationDays?: number
    }
  | {
      readonly intent: 'renew'
      readonly name?: string
      readonly durationYears?: number
      readonly durationDays?: number
    }
  | {
      readonly intent: 'find_names' | 'bulk_renew'
      readonly filters: SmartNameFilters
      readonly referencedSelection?: boolean
    }
  | {
      readonly intent: 'migrate'
      readonly excludeManagerRestoration: boolean
    }
  | {
      readonly intent: 'edit_profile'
      readonly name?: string
      readonly section: 'general' | 'links' | 'contact' | 'addresses'
      readonly value?: string
    }
  | {
      readonly intent: 'notification'
      readonly preference:
        | 'favouritedNameExpiry'
        | 'ownedNameExpiry'
        | 'ensLabsUpdates'
      readonly enabled: boolean
    }
  | { readonly intent: 'favorite' | 'view_name'; readonly name?: string }

export type AiInterpretResult =
  | {
      readonly status: 'ok'
      readonly action: AiAction
      readonly multiAction?: { readonly nextIntent: AiIntent }
    }
  | { readonly status: 'unsupported' | JevFailureStatus }

const intents = {
  set_primary: 'Choose or change the connected wallet primary ENS name.',
  register: 'Register an available ENS name.',
  renew: 'Extend one existing ENS name.',
  find_names: 'Find or show names in the connected wallet dashboard.',
  bulk_renew: 'Prepare renewal of a filtered group of wallet names.',
  migrate: 'Upgrade eligible ENSv1 names to ENSv2.',
  edit_profile: 'Edit profile records such as a link, avatar, or description.',
  notification: 'Change an existing notification preference.',
  favorite: 'Add a specific ENS name to favorites.',
  view_name: 'Open the page for a specific ENS name.',
  unsupported: 'An action or requirement Manager cannot perform here.',
} as const

const nextIntents = { ...intents, none: 'No second action requested.' } as const
const dashboardQuestions = buildJevNameSearchRequest('').questions

const nameCandidatePattern = /(?<!\S)([^\s/@]+\.[^\s/@]+)(?!\S)/gu

const stripNamePunctuation = (candidate: string): string =>
  candidate.replace(/^["'([{]+|["')\]},!?;:]+$/g, '')

export const extractEnsNames = (query: string): readonly string[] => {
  const matches = [...query.matchAll(nameCandidatePattern)]
  const names = matches.flatMap((match) => {
    const candidate = match[1] && stripNamePunctuation(match[1])
    if (!candidate) return []
    try {
      return [normalize(candidate).toLowerCase()]
    } catch {
      return []
    }
  })
  const unique = [...new Set(names)]
  return [
    ...unique.filter((name) => name.endsWith('.eth')),
    ...unique.filter((name) => !name.endsWith('.eth')),
  ]
}

export const redactAiQuery = (query: string): string =>
  query
    .replace(/https?:\/\/\S+/gi, '[URL]')
    .replace(/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/g, '[EMAIL]')
    .replace(/\b0x[a-f\d]{40}\b/gi, '[ADDRESS]')
    .replace(nameCandidatePattern, '[ENS_NAME]')

const durationWords: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
}

export const parseActionDuration = (
  query: string,
): { durationDays?: number; durationYears?: number } | null => {
  const matches = [
    ...query.matchAll(
      /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(days?|weeks?|months?|years?)\b/gi,
    ),
  ]
  if (matches.length === 0) return {}
  if (matches.length !== 1) return null
  const match = matches[0]
  const quantityText = match?.[1]
  const unit = match?.[2]?.toLowerCase()
  if (!quantityText || !unit || match.index === undefined) return null
  if (!/\bfor\s*$/i.test(query.slice(0, match.index))) return null
  const quantity =
    durationWords[quantityText.toLowerCase()] ?? Number(quantityText)
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000)
    return null
  if (unit.startsWith('month')) return null
  if (unit.startsWith('year'))
    return quantity <= 100 ? { durationYears: quantity } : null
  const days = unit.startsWith('week') ? quantity * 7 : quantity
  return days <= 365_000 ? { durationDays: days } : null
}

export const buildJevAiRequest = (query: string) => ({
  model: 'jev-latest',
  state: redactAiQuery(query),
  questions: {
    ...dashboardQuestions,
    fully_supported: {
      type: 'noul',
      instructions:
        'Can every requested action and constraint be represented by exactly these Manager actions: set primary name, register, renew, find wallet names using dashboard status filters, bulk renew filtered wallet names, migrate eligible ENSv1 names, edit profile, change an existing notification switch, favorite a name, or view a name? Missing a name or URL can be requested from the user. A supported two-step request is allowed if each step is supported. Custom notification timing, transfer, deletion, price prediction, arbitrary content generation, and filters outside the dashboard facets are unsupported.',
      criteria: {
        true: 'Every requested action and constraint is supported.',
        false: 'At least one requested action or constraint is unsupported.',
      },
    },
    unsupported_requirement: {
      type: 'noul',
      instructions:
        'Does ANY part of this request require something outside the listed Manager actions or dashboard filters? A custom reminder schedule, name meaning or topic, transfer, deletion, or arbitrary generated text is unsupported. A missing ENS name, URL, or duration is not unsupported; the UI may ask for it.',
      criteria: {
        true: 'At least one requested requirement is unsupported.',
        false: 'All requested requirements have an available Manager action.',
      },
    },
    intent: {
      type: 'choice',
      instructions:
        'Which one Manager action should be offered first? Choose unsupported if the user does not ask for one of these actions.',
      criteria: intents,
    },
    multi_action: {
      type: 'noul',
      instructions:
        'Does the user explicitly ask for more than one distinct Manager action, for example register a name and then set it as primary? Filters and sort orders are part of one find or bulk-renew action, not separate actions.',
      criteria: {
        true: 'Two or more distinct Manager actions are requested.',
        false: 'Only one Manager action is requested.',
      },
    },
    next_intent: {
      type: 'choice',
      instructions:
        'If a second distinct action is explicitly requested, which Manager action is it? Otherwise choose none.',
      criteria: nextIntents,
    },
  },
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const readChoice = (
  answers: Record<string, unknown>,
  key: 'intent' | 'next_intent',
): AiIntent | 'unsupported' | 'none' | null => {
  const answer = answers[key]
  if (!isRecord(answer) || answer.type !== 'choice') return null
  if (
    typeof answer.choice !== 'string' ||
    typeof answer.confidence !== 'number' ||
    !Number.isFinite(answer.confidence) ||
    answer.confidence < 0.55 ||
    answer.confidence > 1 ||
    !(answer.choice in nextIntents)
  ) {
    return null
  }
  return answer.choice as AiIntent | 'unsupported' | 'none'
}

const readNoul = (
  answers: Record<string, unknown>,
  key: 'fully_supported' | 'unsupported_requirement' | 'multi_action',
): number | null => {
  const answer = answers[key]
  return isRecord(answer) &&
    answer.type === 'noul' &&
    typeof answer.noul === 'number' &&
    Number.isFinite(answer.noul) &&
    answer.noul >= 0 &&
    answer.noul <= 1
    ? answer.noul
    : null
}

const parseProfileSection = (
  query: string,
): Extract<AiAction, { intent: 'edit_profile' }> => {
  const name = extractEnsNames(query)[0]
  const section = /\b(?:github|twitter|x\.com|website|social|link|url)\b/i.test(
    query,
  )
    ? 'links'
    : /\b(?:email|phone|contact)\b/i.test(query)
      ? 'contact'
      : /\b(?:address|bitcoin|ethereum)\b/i.test(query)
        ? 'addresses'
        : 'general'
  const value = query.match(/https?:\/\/\S+/i)?.[0]
  return {
    intent: 'edit_profile',
    ...(name && { name }),
    section,
    ...(value && { value }),
  }
}

const hasUnsupportedNotificationSchedule = (query: string): boolean =>
  /\b(?:every|daily|weekly|monthly|at\s+\d|\d+\s+(?:days?|weeks?|months?|years?)|(?:one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:days?|weeks?|months?|years?))\b/i.test(
    query,
  )

const hasUnsupportedAction = (query: string): boolean =>
  /\b(?:delete|transfer|sell|auction|mint|generate|summarize|swap)\b/i.test(
    query,
  )

const hasSecondActionCue = (query: string): boolean =>
  /\b(?:and then|then|and also)\s+(?:set|register|renew|upgrade|add|favourit\w*|favorit\w*|show|turn)\b/i.test(
    query,
  )

const normalizedAiPhrase = (query: string): string =>
  redactAiQuery(query)
    .toLowerCase()
    .replace(/[?.!,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const isRegisterThenPrimary = (query: string): boolean =>
  /^register \[ens_name\] for (?:\d+|one|two|three|four|five|six|seven|eight|nine|ten) (?:days?|weeks?|years?) and then set it as (?:my )?primary(?: name)?$/.test(
    normalizedAiPhrase(query),
  )

const isDirectSupportedPrompt = (intent: AiIntent, query: string): boolean => {
  const normalized = normalizedAiPhrase(query)
  if (intent === 'register') {
    return (
      /^register (?:\[ens_name\]|(?:an? )?name)(?: for (?:\d+|one|two|three|four|five|six|seven|eight|nine|ten) (?:days?|weeks?|years?))?$/.test(
        normalized,
      ) || isRegisterThenPrimary(query)
    )
  }
  if (intent === 'notification') {
    return /^(?:turn|switch) (?:on|off) (?:my )?(?:favou?rite|favou?rited|owned)(?: names?)? (?:expiry|expiration) (?:reminders?|notifications?)$/.test(
      normalized,
    )
  }
  if (intent === 'migrate') {
    return /^upgrade (?:my )?eligible (?:ens)?v1 names (?:except|excluding|without) (?:ones|those|names)? ?(?:needing|requiring) manager restoration$/.test(
      normalized,
    )
  }
  if (intent === 'find_names' || intent === 'bulk_renew') {
    const allowed = new Set([
      'show',
      'renew',
      'find',
      'list',
      'my',
      'the',
      'all',
      'only',
      'names',
      'name',
      'domains',
      'domain',
      'i',
      'own',
      'owned',
      'owner',
      'manage',
      'managed',
      'manager',
      'expiring',
      'expire',
      'expires',
      'expired',
      'expiry',
      'soon',
      'within',
      'next',
      'in',
      'days',
      'day',
      'grace',
      'period',
      'past',
      'after',
      'active',
      'non-expiring',
      'never',
      'without',
      'eligible',
      'ineligible',
      'upgrade',
      'upgradeable',
      'v1',
      'v2',
      'ensv1',
      'ensv2',
      'favorite',
      'favorites',
      'favourite',
      'favourites',
      'primary',
      'not',
      'sort',
      'sorted',
      'by',
      'order',
      'ascending',
      'descending',
      'oldest',
      'newest',
      'first',
      'last',
      'soonest',
      'latest',
      'alphabetical',
      'and',
      'are',
      'that',
    ])
    return normalized
      .split(' ')
      .every((word) => allowed.has(word) || /^\d+$/.test(word))
  }
  return false
}

const readAiIntent = (
  answers: Record<string, unknown>,
  query: string,
): AiIntent | 'unsupported' | 'none' | null => {
  if (
    /^(?:please )?renew (?:those|these|selected) names[.!?]?$/i.test(
      query.trim(),
    )
  ) {
    const answer = answers.intent
    if (
      isRecord(answer) &&
      answer.type === 'choice' &&
      (answer.choice === 'renew' || answer.choice === 'bulk_renew') &&
      typeof answer.confidence === 'number' &&
      Number.isFinite(answer.confidence) &&
      answer.confidence >= 0.3 &&
      answer.confidence <= 1
    )
      return 'bulk_renew'
  }
  return readChoice(answers, 'intent')
}

const parseRegistration = (
  name: string | undefined,
  query: string,
): Extract<AiAction, { intent: 'register' }> | null => {
  const duration = parseActionDuration(query)
  if (!duration) return null
  const days =
    duration.durationDays ??
    (duration.durationYears ? duration.durationYears * 365 : undefined)
  if (days !== undefined && (days < 28 || days > 365_000)) return null
  return {
    intent: 'register',
    ...(name && { name }),
    ...(days && { durationDays: days }),
  }
}

const parseRenewal = (
  name: string | undefined,
  query: string,
): Extract<AiAction, { intent: 'renew' }> | null => {
  const duration = parseActionDuration(query)
  return duration
    ? { intent: 'renew', ...(name && { name }), ...duration }
    : null
}

const parseNameSelection = (
  intent: 'find_names' | 'bulk_renew',
  query: string,
  answers: Record<string, unknown>,
): Extract<AiAction, { intent: 'find_names' | 'bulk_renew' }> | null => {
  // The AI support answers cover the whole action; dashboard facet parsing
  // checks the same closed choices and deterministic query constraints.
  const filters = parseJevNameSearchResponse(
    {
      answers: {
        ...answers,
        // AI support is checked once for the whole action. The dashboard
        // parser then validates only its closed facets and explicit cues.
        fully_supported: { type: 'noul', noul: 1 },
      },
    },
    query,
  )
  const referencedSelection = /\b(?:those|these|selected)\s+names\b/i.test(
    query,
  )
  if (!filters && !referencedSelection && intent === 'bulk_renew') return null
  return {
    intent,
    filters: filters ?? {},
    ...(referencedSelection && { referencedSelection: true }),
  }
}

const parseMigration = (
  query: string,
): Extract<AiAction, { intent: 'migrate' }> | null => {
  const hasExclusion = /\b(?:except|excluding|without)\b/i.test(query)
  const excludesRestoration =
    /\b(?:except|excluding|without)\b.*\b(?:manager\s+restoration|restor\w*\s+manager)\b/i.test(
      query,
    )
  if (hasExclusion && !excludesRestoration) return null
  return { intent: 'migrate', excludeManagerRestoration: excludesRestoration }
}

const parseNotification = (
  query: string,
): Extract<AiAction, { intent: 'notification' }> | null => {
  if (hasUnsupportedNotificationSchedule(query)) return null
  const preference = /\bfavou?rit/i.test(query)
    ? 'favouritedNameExpiry'
    : /\b(?:news|updates|ens labs)\b/i.test(query)
      ? 'ensLabsUpdates'
      : /\b(?:owned|my names?|expir\w*)\b/i.test(query)
        ? 'ownedNameExpiry'
        : null
  if (!preference) return null
  return {
    intent: 'notification',
    preference,
    enabled: !/\b(?:off|disable|stop|unsubscribe)\b/i.test(query),
  }
}

const parseAction = (
  intent: AiIntent,
  query: string,
  answers: Record<string, unknown>,
): AiAction | null => {
  const name = extractEnsNames(query)[0]
  switch (intent) {
    case 'set_primary':
    case 'favorite':
    case 'view_name':
      return { intent, ...(name && { name }) }
    case 'register':
      return parseRegistration(name, query)
    case 'renew':
      return parseRenewal(name, query)
    case 'find_names':
    case 'bulk_renew':
      return parseNameSelection(intent, query, answers)
    case 'migrate':
      return parseMigration(query)
    case 'edit_profile':
      return parseProfileSection(query)
    case 'notification':
      return parseNotification(query)
  }
}

const supportsAiQuery = (
  intent: AiIntent,
  query: string,
  supported: number,
  unsupported: number,
): boolean =>
  (supported >= 0.5 && unsupported < 0.5) ||
  (supported >= 0.2 &&
    unsupported < 0.6 &&
    isDirectSupportedPrompt(intent, query))

const readAiDecision = (
  answers: Record<string, unknown>,
  query: string,
): { intent: AiIntent; nextIntent?: AiIntent } | null => {
  const supported = readNoul(answers, 'fully_supported')
  const unsupported = readNoul(answers, 'unsupported_requirement')
  const multi = readNoul(answers, 'multi_action')
  const intent = readAiIntent(answers, query)
  if (
    supported === null ||
    unsupported === null ||
    multi === null ||
    (multi > 0.3 && multi < 0.7) ||
    (hasSecondActionCue(query) && multi < 0.7) ||
    !intent ||
    intent === 'none' ||
    intent === 'unsupported'
  ) {
    return null
  }
  if (!supportsAiQuery(intent, query, supported, unsupported)) return null
  if (intent !== 'find_names' && /\band\b/i.test(query) && multi < 0.7)
    return null

  const nextIntent = readChoice(answers, 'next_intent')
  if (
    multi >= 0.7 &&
    (!nextIntent || nextIntent === 'none' || nextIntent === 'unsupported')
  )
    return null
  if (
    isRegisterThenPrimary(query) &&
    (intent !== 'register' || multi < 0.7 || nextIntent !== 'set_primary')
  )
    return null

  return {
    intent,
    ...(multi >= 0.7 &&
    nextIntent &&
    nextIntent !== 'none' &&
    nextIntent !== 'unsupported'
      ? { nextIntent }
      : {}),
  }
}

export const parseJevAiResponse = (
  response: unknown,
  query: string,
): Extract<AiInterpretResult, { status: 'ok' }> | null => {
  if (!isRecord(response) || !isRecord(response.answers)) return null
  if (hasUnsupportedAction(query)) return null
  const answers = response.answers
  const decision = readAiDecision(answers, query)
  if (!decision) return null

  const action = parseAction(decision.intent, query, answers)
  if (!action) return null
  return {
    status: 'ok',
    action,
    ...(decision.nextIntent && {
      multiAction: { nextIntent: decision.nextIntent },
    }),
  }
}
