import { normalize } from 'viem/ens'
import {
  buildJevNameSearchRequest,
  hasValidJevNameSearchFacets,
  parseJevNameSelectionFacets,
} from '@/features/dashboard/service/jevNameSearch'
import { normalizeNegativeNameSelection } from '@/features/dashboard/service/nameSearchLanguage'
import type { SmartNameFilters } from '@/features/dashboard/smartNameSearch'
import { PROFILE_FIELD_DEFINITIONS } from '@/features/profile/service/profileFieldRegistry'
import {
  type ActionDuration,
  buildJevActionDetailQuestions,
  hasNegatedAction,
  parseSemanticDuration,
  readDetailChoice,
} from './actionDetails'
import {
  hasExplicitNameActionConflict,
  hasProfileActionConflict,
  isExplicitlyExcludedAiTarget,
} from './actionSafety'
import { splitBulkSelectionDuration } from './bulkSelectionIntent'
import type { JevFailureStatus } from './jevBoundary'
import {
  hasLiteralNameSelectionAgreement,
  proveLiteralNameSelection,
} from './literalNameSelection'
import {
  buildManagerActionQuestions,
  hasExplicitManagerOperation,
  type ManagerAction,
  managerActionCatalog,
  parseManagerAction,
} from './managerActions'
import {
  buildMigrationQuestions,
  isSingleMigrationIntent,
  parseMigrationIntent,
} from './migrationIntent'
import type { ProfileActionDetails } from './profileAiPreparation'
import {
  buildJevProfileQuestions,
  buildProfileValueContext,
  hasExplicitSocialProfileOperation,
  isSingleProfileEdit,
  parseProfileSection,
} from './profileIntent'
import {
  hasCompleteProfileOwnerViewRequest,
  startsProfileOwnerQuestion,
} from './profileNativeRead'
import { splitRenewalTargetDate } from './renewalTargetDateIntent'
import { hasSupportedSelectionConstraints } from './selectionConstraints'
import {
  canResolveCompleteSocialIntent,
  hasCompleteSocialRequestEvidence,
} from './socialRequestEvidence'

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
  | 'manager_action'

export type AiAction = (
  | { readonly intent: 'set_primary'; readonly name?: string }
  | {
      readonly intent: 'register'
      readonly name?: string
      readonly durationDays?: number
      readonly durationUnitRequested?: boolean
      readonly durationAmount?: number
    }
  | {
      readonly intent: 'renew'
      readonly name?: string
      readonly durationYears?: number
      readonly durationDays?: number
      readonly targetDate?: string
      readonly durationUnitRequested?: boolean
      readonly durationAmount?: number
    }
  | ({
      readonly intent: 'find_names' | 'bulk_renew'
      readonly filters: SmartNameFilters
      readonly referencedSelection?: boolean
      readonly allNames?: boolean
      readonly names?: readonly string[]
    } & ActionDuration)
  | {
      readonly intent: 'migrate'
      readonly excludeManagerRestoration: boolean
      readonly allEligible?: true
      readonly names?: readonly string[]
    }
  | ({
      readonly intent: 'edit_profile'
      readonly name?: string
    } & ProfileActionDetails)
  | ManagerAction
  | {
      readonly intent: 'notification'
      readonly preference?:
        | 'favouritedNameExpiry'
        | 'ownedNameExpiry'
        | 'ensLabsUpdates'
      readonly enabled?: boolean
    }
  | { readonly intent: 'favorite' | 'view_name'; readonly name?: string }
) & { readonly nameCandidates?: readonly string[] }

export type AiInterpretResult =
  | {
      readonly status: 'needs_confirmation'
      readonly action: AiAction
      readonly multiAction?: { readonly nextIntent: AiIntent }
    }
  | {
      readonly status: 'ok'
      readonly action: AiAction
      readonly multiAction?: { readonly nextIntent: AiIntent }
    }
  | { readonly status: 'unsupported' | JevFailureStatus }

const intents = {
  set_primary:
    'Choose the ENS name displayed for a wallet: its primary, main, reverse, or display name. Making a name identify the wallet changes the primary name; editing the Ethereum address stored on a name belongs to edit_profile.',
  register:
    'Acquire a NEW ENS name: register, buy, get, or claim it for an optional duration. Manager checks availability.',
  renew:
    'Add time to existing ENS names: renew, extend, keep longer, or add days, weeks, or years. This includes ONE exact name and MULTIPLE wallet names selected by status or a previous search. Target scope is a separate decision. A clear request to renew until/through/to a future full date or make existing names expire on that date is renewal. Duration alone does not imply renewal.',
  find_names:
    'Read-only search: show, find, list, or identify wallet names using status filters or sorting. Includes which name is my primary/main/reverse name and which names are eligible for upgrade. Merely finding upgradeable names is not migrating them. An omitted exact ENS name does not mean unsupported.',
  bulk_renew:
    'Renew or extend MULTIPLE wallet names selected by filters or a previous search, including those names. An expiry window selects names; it is not added renewal time.',
  migrate:
    'Actually start upgrading or migrating eligible ENSv1 names to ENSv2, optionally excluding names that need manager restoration. Showing or finding eligible names without asking to upgrade them is find_names.',
  edit_profile: `Open profile sections or edit, remove, or feature existing profile fields: ${PROFILE_FIELD_DEFINITIONS.map(({ label }) => label).join(', ')}, cryptocurrency addresses, custom links, and theme. Profile email/social records belong here; notification contact methods belong to manager_action. Setting a name address is a profile edit even when its value is missing. One field replacement is one edit.`,
  notification:
    'Enable or disable favourite expiry, owned-name expiry, or ENS Labs news and updates. Includes mute, unsubscribe, stop alerts, and remind me when names expire.',
  favorite:
    'Add a specific ENS name to favourites: favourite, favorite, star, bookmark, or save it in favourite names.',
  view_name:
    'Navigate to the existing profile of ONE specific ENS name: show, open, view, visit, inspect, take me to, let me see, or bring up that name.',
  manager_action: `Use another existing Manager control: ${Object.values(managerActionCatalog).join(' ')}`,
  unsupported:
    'No listed Manager action is requested, or the requested action is outside these capabilities.',
} as const

// Keep support questions self-contained: a batch of independent typed choices
// must not depend on another question providing the capability definitions.
const supportedCapabilities =
  'Manager supports: setting a primary/main/reverse name; registering a new name for a positive whole number of days, weeks, or years; keeping, extending or renewing one name by an additional positive whole number of days, weeks, or years, or to an explicitly supplied future calendar date; bulk renewing an exact list of wallet names or names selected by filters or a previous search, with optional additional days, weeks, or years or one shared future target expiry date; finding wallet names by approaching expiry, active, expired, in grace, past grace, explicitly non-expiring or never-expiring, owner/manager role, ENSv1/ENSv2, upgrade eligibility, favourite OR not-favourite status, primary OR not-primary status, and name/created/expiry sorting; migrating eligible ENSv1 names, optionally excluding manager restoration; opening profile sections or editing a supplied description, avatar URL, email, GitHub username, Ethereum address, theme, or link; enabling or disabling favourite expiry, owned-name expiry, and ENS Labs news/updates; adding a favourite; and opening one name profile. Filtering for not-favourite names and not-primary names is fully supported. A name list with a favourite=no filter is one supported selection. Two alternative exact names require a targeted name picker rather than rejection. Finding names that never expire means the non-expiring filter; it does not request changing an expiry or making registrations permanent. Phrases such as keep a name for 90 more days are added renewal time. Asking for a supported action with missing or ambiguous names, values, durations, or notification preferences is also supported: Manager asks a follow-up question. Ownership, availability, eligibility, prices, duration limits, and wallet confirmation are checked by Manager. Two supported actions can be explained, with only the first offered.'
const expandedCapabilities = `Manager also supports these existing controls: ${Object.values(managerActionCatalog).join(' ')} Profile edits support ${PROFILE_FIELD_DEFINITIONS.map(({ label }) => label).join(', ')}, all address networks in the native editor, and named custom links. Deleting or removing any existing profile field is supported, including Bitcoin, Solana, Ethereum and other cryptocurrency addresses, phone number, and social records. This removes only that profile record, never the ENS name itself. Profile fields may be set or removed, existing contact fields featured or unfeatured, and EVM network addresses can reuse the existing Ethereum address. Link titles can be renamed, including a request to rename an existing link with the new title omitted; Manager asks for that new title. Changes always open a review. Missing exact values are clarified; the model must never invent values.`
const unsupportedCapabilities =
  'Unsupported requirements include transferring, deleting, burning, selling, or creating subnames; removing a primary name; arbitrary resolver/role editing; generated content; raw custom records/contenthash/ABI; custom reminder schedules; scheduled execution; months as durations; ambiguous dates or invalid target dates; name meaning/text filters; OR filters; and unlisted constraints. Removing a profile record, favorite, or notification contact method and claiming the migration commemorative NFT ARE supported.'

const nextIntents = { ...intents, none: 'No second action requested.' } as const
// Renewal is one operation. Asking the model to choose between single and
// bulk renewal split its confidence even when it understood all filters.
const operationChoices = Object.fromEntries(
  Object.entries(intents).filter(([key]) => key !== 'bulk_renew'),
)
const dashboardQuestions = buildJevNameSearchRequest('').questions

const isInterfaceLanguageRequest = (query: string): boolean =>
  /\b(?:app|interface|manager|ui)\b/i.test(query) &&
  (/\b(?:language|langauge|lang)\b/i.test(query) ||
    /\b(?:change|switch|set)\b.+\b(?:to|into)\b/i.test(query)) &&
  !/\b(?:profile|records?)\b|\.eth\b/i.test(query)

const nameCandidatePattern = /(?<!\S)([^\s/@]+\.[^\s/@]+)(?!\S)/gu
// Redaction is intentionally broader than exact-name extraction: a slash or
// punctuation attached to a name must not let it reach TypeSafe.
const redactionNamePattern = /[^\s/@]+\.[^\s/@]+/gu

const stripNamePunctuation = (candidate: string): string =>
  candidate.replace(/^["'([{]+|["')\]},.!?;:]+$/g, '').replace(/['’]s$/i, '')

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

export const redactAiQuery = (
  query: string,
  names?: readonly string[],
): string =>
  query
    .replace(/\b[a-z][a-z\d+.-]*:\/\/\S+/gi, '[URL]')
    .replace(/[^\s/@]+\.[^\s/@]+\/\S+/gu, '[URL]')
    .replace(/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/g, '[EMAIL]')
    .replace(/\b0x[a-f\d]{40}\b/gi, '[ADDRESS]')
    .replace(redactionNamePattern, (candidate) => {
      if (!names) return '[ENS_NAME]'
      try {
        const index = names.indexOf(
          normalize(stripNamePunctuation(candidate)).toLowerCase(),
        )
        return index > 0 ? `[ENS_NAME_${index + 1}]` : '[ENS_NAME]'
      } catch {
        return '[ENS_NAME]'
      }
    })

export const parseActionDuration = (
  query: string,
  intent: 'register' | 'renew' = 'register',
): { durationDays?: number; durationYears?: number } | null => {
  if (intent === 'register' && /\bby\s+\d/i.test(query)) return null
  const duration = parseSemanticDuration(query)
  return duration?.durationUnitRequested ? null : duration
}

export const buildJevAiRequest = (query: string) => {
  const context = buildProfileValueContext(query)
  const isInterfaceLanguage = isInterfaceLanguageRequest(query)
  const isNotificationChannel =
    /\b(?:notifications?|alerts?|reminders?|browser)\b/i.test(query) &&
    /\b(?:email|e-mail|telegram|push)\b/i.test(query) &&
    !/\b(?:profile|records?)\b/i.test(query) &&
    extractEnsNames(query).length === 0
  const state =
    isInterfaceLanguage || isNotificationChannel ? query : context.state
  const names = extractEnsNames(context.targetQuery)
  return {
    model: 'jev-latest',
    state: normalizeNegativeNameSelection(redactAiQuery(state, names)),
    questions: {
      ...dashboardQuestions,
      expiry_window: {
        ...dashboardQuestions.expiry_window,
        instructions: `${dashboardQuestions.expiry_window.instructions} For registration or renewal, answer ONLY about the CURRENT expiry condition selecting names. Added renewal time and a supplied target expiry date are independent action details, not selection cutoffs: ignore them for this question. For example, renew managed names expiring within 24 days until a full future calendar date has positive_days; renew my names until a full date has none. Absolute dates are unsupported here only when they filter which names currently qualify, not when they specify the requested new expiry date.`,
      },
      ...buildJevActionDetailQuestions(context.targetQuery, names),
      ...buildJevProfileQuestions(query),
      ...buildManagerActionQuestions(query),
      ...buildMigrationQuestions(),
      fully_supported: {
        type: 'noul',
        instructions: `${supportedCapabilities} ${expandedCapabilities} ${unsupportedCapabilities} Is the user requesting supported Manager operations? Registration for a stated number of days, weeks, or years is supported; Manager validates its duration. Polite phrasing does not add a requirement. Incomplete requests remain supported because Manager asks for missing details. Understand typos and shorthand. Do not decide ownership or availability.`,
        criteria: {
          true: 'Only supported operations are requested, such as registration for a stated duration, opening a name, or changing a preference. Missing details can be clarified.',
          false:
            'At least one explicit requested action or constraint is outside the supported capabilities.',
        },
      },
      unsupported_requirement: {
        type: 'noul',
        instructions: `${supportedCapabilities} ${expandedCapabilities} ${unsupportedCapabilities} Does the user explicitly demand an unsupported operation or constraint? A registration duration in days is supported. Missing details and later Manager validation are not unsupported requirements. Turning off or muting an existing notification is supported.`,
        criteria: {
          true: 'At least one explicit action or constraint cannot be handled by Manager.',
          false:
            'Every requested action and constraint is supported or needs clarification.',
        },
      },
      intent: {
        type: 'choice',
        instructions:
          'Choose the FIRST requested Manager action, understanding typos, shorthand, and polite questions. Use the requested operation, not whether the name is available or owned. Acquiring a new name is register; using an ENS name as the name displayed for a wallet is set_primary; adding time to one or more existing names or making them expire on an explicitly supplied future date is renew. Setting the Ethereum, ETH, or EVM address stored on an ENS name is edit_profile, including when the new address is missing. Renewing a filtered group or those names is also renew; merely showing that group is find_names. Navigating to one exact name, including inspect its profile, take me to, or bring up, is view_name. Sharing (including shrae) or copying a profile link is manager_action; opening a profile is not sharing it. Missing details can be clarified. Profile field replacements and renaming a custom link title are edit_profile. A missing replacement value or new link title is still edit_profile and will be clarified. Disabling or muting an existing notification is notification.',
        criteria: operationChoices,
      },
      selection_constraints: {
        type: 'choice',
        instructions:
          'Manager can show or renew these name selections: all wallet names; an exact supplied list of ENS names; a previous selection (those/these/selected names); any AND combination of the following filters: expiring soon (30 days), expiring within any positive whole number of days, active, expired, in grace, past grace, explicitly non-expiring/never expiring, owner or manager role, ENSv1 or ENSv2, eligible or ineligible for upgrade, favourite or not favourite, primary or not primary. Optional sorting supports alphabetical or reverse alphabetical, oldest or newest creation first, earliest or latest expiry first. Sorting alone is supported. Renewal may optionally add a positive whole duration in days, weeks, or years, or set a supplied shared target expiry date (until/through an ISO or written full date, or make selected names expire on a date); no duration is also supported because Manager supplies its existing review control. An expiry window selects names and is independent of added renewal time or a shared target expiry date. Target dates are renewal details, not name-selection constraints. This question checks only EXTRA name-selection conditions, not whether a renewal is possible. Do not judge current ownership, renewal eligibility, expiry state, permissions, missing renewal duration, or prices: Manager checks these when reviewing. Can EVERY requested selection constraint be represented? Choose represented when there is no extra constraint. A managed-name selection, active V1 selection, primary-name selection, or expired name past grace is represented even if some matching names may not be renewable. Missing renewal duration never makes a selection unsupported. An exact list joined by and is one collection, not multiple actions. Reject name text/meaning/content/price filters, OR status filters, bounded expiry ranges, unknown expiry, custom schedules, and other unlisted conditions.',
        criteria: {
          represented:
            'All selection constraints and duration are representable.',
          unsupported: 'An explicit constraint cannot be represented.',
        },
      },
      migration_constraints: {
        type: 'choice',
        instructions:
          'This question checks only EXTRA conditions on an upgrade/migration request. Upgrading or migrating names from ENSv1 to ENSv2, upgrading my eligible V1 names, upgrading names, or upgrading an exact supplied name list are represented. Names and live eligibility can be checked later by Manager. The optional exclusion without/except/skip names needing manager restoration is also represented. No other condition is supported: favourite, primary, owner, expiry, or price filters; ONLY names needing restoration; or excluding particular exact names. Choose represented when no extra condition is requested. The destination ENSv2 is part of the upgrade operation, not an unsupported source-name filter. Do not decide ownership or eligibility.',
        criteria: {
          represented:
            'Only an exact name list or eligible V1 names, optionally without manager restoration.',
          unsupported:
            'An additional migration condition or exclusion cannot be represented.',
        },
      },
      renewal_target: {
        type: 'choice',
        instructions:
          'For renewal, identify the target collection, independently of duration. Renew my names expiring within 45 days, renew my owned names in grace, extend my V2 names, and renew those names ALL target wallet_set. A future expiry condition is a filter selecting this group. One ENS name placeholder is one. Several explicitly listed ENS name placeholders are exact_list. Renew my favourites or my bookmarks selects wallet_set, even without the word names. My primary/main/reverse name selects the matching wallet name and is wallet_set, not a missing exact ENS name. Use unclear only when the scope cannot be established.',
        criteria: {
          one: 'One ENS name, possibly missing and needing to be supplied.',
          wallet_set:
            'Wallet names selected by filters, all names, or a previous search.',
          exact_list: 'Several explicitly named ENS names.',
          unclear: 'Not a renewal request, or the target scope is ambiguous.',
        },
      },
      multi_action: {
        type: 'noul',
        instructions:
          'Does the user explicitly ask for more than one distinct Manager action, for example register a name and then set it as primary? Filters, sort orders, renewal durations, and multiple exact target names are part of one find, bulk-renew, or migration operation, not separate actions. Renew [ENS_NAME] and [ENS_NAME_2] for 84 days is one renewal operation. Migrate [ENS_NAME] and [ENS_NAME_2] is one migration operation. The word and between names does not introduce a second action. Opening or editing a profile and setting one field is one edit_profile action, even when joined by and. For example, edit my profile [ENS_NAME] and set github name to newuser instead of olduser is one action; changing from an old value to a new value is also one action.',
        criteria: {
          true: 'Two or more distinct Manager actions are requested.',
          false: 'Only one Manager action is requested.',
        },
      },
      next_intent: {
        type: 'choice',
        instructions:
          'If a second distinct action is explicitly requested, which Manager action is it? Otherwise choose none. Editing a profile and setting one of its fields is the same action, so choose none for that request.',
        criteria: nextIntents,
      },
    },
  }
}

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
    !Object.hasOwn(nextIntents, answer.choice)
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

const hasUnsupportedNotificationSchedule = (query: string): boolean =>
  /\b(?:every|daily|weekly|monthly|at\s+\d|\d+\s+(?:days?|weeks?|months?|years?)|(?:one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:days?|weeks?|months?|years?))\b/i.test(
    query,
  )

const hasUnsupportedAction = (query: string, intent: AiIntent): boolean => {
  const instruction = withoutQuotedValues(redactAiQuery(query))
  if (/\b(?:sell|auction|generate|summarize)\b/i.test(instruction)) return true
  if (
    /\btransfer\b/i.test(instruction) &&
    !(
      intent === 'manager_action' &&
      /\b(?:notifications?|inbox|alerts?)\b/i.test(instruction)
    )
  )
    return true
  if (
    /\bmint\b/i.test(instruction) &&
    !(
      intent === 'manager_action' &&
      /\b(?:nft|commemorative)\b/i.test(instruction)
    )
  )
    return true
  if (
    /\bdelete\b/i.test(instruction) &&
    intent !== 'edit_profile' &&
    intent !== 'manager_action'
  )
    return true
  return /\bswap\b/i.test(instruction) && intent !== 'edit_profile'
}

const withoutQuotedValues = (query: string): string =>
  query.replace(/"[^"]*"|(?<![\p{L}\p{N}])'[^']*'|“[^”]*”|‘[^’]*’/gu, '[VALUE]')

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

const isExactReferencedBulkRenew = (query: string): boolean =>
  /^(?:please )?renew (?:those|these|selected) names (?:except|excluding|without) (?:my )?favou?rites?$/.test(
    normalizedAiPhrase(query),
  )

const isDirectSupportedPrompt = (intent: AiIntent, query: string): boolean => {
  const normalized = normalizedAiPhrase(query)
  if (
    (intent === 'favorite' || intent === 'view_name') &&
    /^(?:star|favou?rite|show|open|view) \[ens_name\] or \[ens_name\]$/.test(
      normalized,
    )
  )
    return true
  if (intent === 'renew')
    return /^(?:renew|extend|keep) \[ens_name\] (?:for|by|another) (?:\d+|one|two|three|four|five|six|seven|eight|nine|ten) (?:more |extra )?(?:days?|weeks?|years?)$/.test(
      normalized,
    )
  if (intent === 'register') {
    return (
      /^register (?:\[ens_name\]|(?:an? )?name)(?: for (?:\d+|one|two|three|four|five|six|seven|eight|nine|ten) (?:days?|weeks?|years?))?$/.test(
        normalized,
      ) || isRegisterThenPrimary(query)
    )
  }
  if (intent === 'notification') {
    return /^(?:turn|switch) (?:on|off) (?:my )?(?:(?:favou?rite|favou?rited|owned)(?: names?)? (?:expiry|expiration) )?(?:reminders?|notifications?)$/.test(
      normalized,
    )
  }
  if (intent === 'migrate') {
    return /^upgrade (?:my )?eligible (?:ens)?v1 names (?:except|excluding|without) (?:ones|those|names)? ?(?:needing|requiring) manager restoration$/.test(
      normalized,
    )
  }
  if (intent === 'bulk_renew' && isExactReferencedBulkRenew(query)) {
    return true
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

const readRenewalScope = (
  answers: Record<string, unknown>,
  query: string,
): 'renew' | 'bulk_renew' | null => {
  const answer = answers.renewal_target
  if (
    !isRecord(answer) ||
    answer.type !== 'choice' ||
    typeof answer.choice !== 'string' ||
    !['one', 'wallet_set', 'exact_list', 'unclear'].includes(answer.choice) ||
    typeof answer.confidence !== 'number' ||
    !Number.isFinite(answer.confidence) ||
    answer.confidence < 0 ||
    answer.confidence > 1
  )
    return null
  const names = extractEnsNames(query)
  if (names.length > 1)
    return /\bor\b/i.test(redactAiQuery(query)) ? 'renew' : 'bulk_renew'
  const collection =
    /\b(?:names|domains|those|these|selected|favou?rites|bookmarks)\b/i.test(
      query,
    )
  // Exact values and literal collection words determine target cardinality;
  // confidence in the independent scope question cannot change that target.
  if (names.length === 0 && collection) return 'bulk_renew'
  if (
    names.length === 0 &&
    /\b(?:my|the|our)\s+(?:primary|main|reverse)\s+name\b/i.test(query) &&
    readDetailChoice(answers, 'primary', ['yes', 'no', 'any']) === 'yes'
  )
    return 'bulk_renew'
  if (
    names.length === 0 &&
    readDetailChoice(answers, 'renewal_target', [
      'wallet_set',
      'one',
      'exact_list',
      'unclear',
    ]) === 'wallet_set'
  )
    return 'bulk_renew'
  if (answer.choice === 'wallet_set' && collection) return 'bulk_renew'
  return 'renew'
}

const hasExplicitManagerContext = (
  query: string,
  kind: ManagerAction['kind'],
): boolean => {
  if (hasExplicitManagerOperation(query, kind)) return true
  const instruction = redactAiQuery(query)
    .replace(/^(?:(?:can|could|would)\s+you\s+)?(?:please\s+)?/i, '')
    .trim()
  if (['share_profile', 'copy_profile'].includes(kind))
    return /^(?:share|shrae|shar|copy|clipboard|qr)\b/i.test(instruction)
  if (kind === 'view_address')
    return (
      /\b(?:wallet|address)\b/i.test(instruction) &&
      /^(?:show|shwo|view|veiw|open|opne|see|take|list)\b/i.test(instruction)
    )
  if (kind === 'show_favorites')
    return (
      /\b(?:favou?rites?|bookmarked)\b/i.test(instruction) &&
      /^(?:show|shwo|view|veiw|open|opne|see|take|list)\b/i.test(instruction) &&
      !/\b(?:expir\w*|grace|v[12]|primary|sort)\b/i.test(instruction)
    )
  if (kind === 'language') return isInterfaceLanguageRequest(query)
  const channel = kind.split('_')[0]
  if (channel === 'email' || channel === 'telegram' || channel === 'push')
    return (
      new RegExp(
        channel === 'push' ? '\\b(?:push|browser)\\b' : `\\b${channel}\\b`,
        'i',
      ).test(instruction) &&
      /^(?:add|remove|delete|connect|disconnect|resend|resned|enable|disable|disabel|turn|switch)\b/i.test(
        instruction,
      ) &&
      /\b(?:notifications?|alerts?|reminders?|browser)\b/i.test(instruction) &&
      !/\[ENS_NAME\]|\bprofile\b/i.test(instruction)
    )
  return false
}

const hasProfileIntentChoice = (answers: Record<string, unknown>): boolean => {
  const answer = answers.intent
  return (
    isRecord(answer) &&
    answer.type === 'choice' &&
    answer.choice === 'edit_profile' &&
    typeof answer.confidence === 'number' &&
    Number.isFinite(answer.confidence) &&
    answer.confidence >= 0 &&
    answer.confidence <= 1
  )
}

const canResolveSocialIntent = (
  intent: AiIntent | 'unsupported' | 'none' | null,
  management: ReturnType<typeof parseManagerAction>,
  answers: Record<string, unknown>,
): boolean =>
  (intent === null && hasProfileIntentChoice(answers)) ||
  intent === 'favorite' ||
  (intent === 'manager_action' && management?.kind === 'unfavorite')

const readAiIntent = (
  answers: Record<string, unknown>,
  query: string,
  uncertainFirstIntent?: AiIntent,
): AiIntent | 'unsupported' | 'none' | null => {
  const interpreted = uncertainFirstIntent ?? readChoice(answers, 'intent')
  const management = parseManagerAction(query, answers, extractEnsNames(query))
  if (isInterfaceLanguageRequest(query) && management?.kind !== 'language')
    return 'unsupported'
  if (canResolveCompleteSocialIntent(query, answers)) return 'edit_profile'
  // Star/unstar can refer to a social record or the ENS name. Only complete
  // local record syntax with matching model field/operation can settle that
  // collision or an uncertain matching profile intent; the remaining
  // whole-request and profile checks still run with the original answers.
  if (
    canResolveSocialIntent(interpreted, management, answers) &&
    hasExplicitSocialProfileOperation(
      query,
      extractEnsNames(buildProfileValueContext(query).targetQuery)[0],
      answers,
    )
  )
    return 'edit_profile'
  if (management && hasExplicitManagerContext(query, management.kind))
    return 'manager_action'
  if (interpreted === 'renew' && answers.renewal_target !== undefined)
    return readRenewalScope(answers, query)
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
  return interpreted
}

const parseRegistration = (
  name: string | undefined,
  query: string,
  answers: Record<string, unknown>,
): Extract<AiAction, { intent: 'register' }> | null => {
  if (/\bby\s+\d/i.test(query)) return null
  const duration = parseSemanticDuration(query, answers)
  if (!duration) return null
  const days =
    duration.durationDays ??
    (duration.durationYears ? duration.durationYears * 365 : undefined)
  if (days !== undefined && (days < 28 || days > 365_000)) return null
  return {
    intent: 'register',
    ...(name && { name }),
    ...(days && { durationDays: days }),
    ...(duration.durationUnitRequested && {
      durationUnitRequested: true,
      durationAmount: duration.durationAmount,
    }),
  }
}

const parseRenewal = (
  name: string | undefined,
  query: string,
  answers: Record<string, unknown>,
): Extract<AiAction, { intent: 'renew' }> | null => {
  const target = splitRenewalTargetDate(query)
  if (!target) return null
  if (target.targetDate) {
    const remaining = parseSemanticDuration(target.selection)
    const redacted = redactAiQuery(target.selection).trim()
    if (
      !remaining ||
      Object.keys(remaining).length > 0 ||
      !/^(?:please\s+)?(?:renew|extend|keep)\s+(?:(?:my|the)\s+)?\[ENS_NAME\][.!?]?$/i.test(
        redacted,
      )
    )
      return null
    return {
      intent: 'renew',
      ...(name && { name }),
      targetDate: target.targetDate,
    }
  }
  const duration = parseSemanticDuration(query, answers)
  return duration
    ? { intent: 'renew', ...(name && { name }), ...duration }
    : null
}

const hasExactVersionSelectionAgreement = (
  query: string,
  answers: Record<string, unknown>,
): boolean => {
  const match =
    /^(?:please\s+)?(?:show|find|list|renew|extend)(?:\s+me)?\s+(?:(?:all\s+(?:of\s+)?)?(?:my|the)\s+)?(?:ens[\s-]*)?v([12])\s+(?:names|domains)(?:\s+please)?[.!?]?$/i.exec(
      query.trim(),
    )
  if (
    !match ||
    readDetailChoice(answers, 'version', ['v1', 'v2']) !== `v${match[1]}`
  )
    return false
  const constraint = answers.selection_constraints
  if (
    !isRecord(constraint) ||
    constraint.type !== 'choice' ||
    constraint.choice !== 'represented' ||
    typeof constraint.confidence !== 'number' ||
    !Number.isFinite(constraint.confidence) ||
    constraint.confidence < 0 ||
    constraint.confidence > 1
  )
    return false
  // This full literal grammar has exactly one filter. Only settle the extra
  // constraint vote when every independent model facet agrees with that fact.
  return ['expiry', 'role', 'upgrade', 'favorite', 'primary', 'sort'].every(
    (key) => {
      const facet = answers[key]
      return (
        isRecord(facet) && facet.type === 'choice' && facet.choice === 'any'
      )
    },
  )
}

const readLiteralSelectionProof = (
  query: string,
  answers: Record<string, unknown>,
  addedDurationRemoved = false,
) => {
  const names = extractEnsNames(query)
  const redacted = normalizeNegativeNameSelection(redactAiQuery(query, names))
  return hasLiteralNameSelectionAgreement(
    redacted,
    answers,
    names,
    addedDurationRemoved,
  )
    ? proveLiteralNameSelection(redacted, names, addedDurationRemoved)
    : null
}

const parseNameSelection = (
  intent: 'find_names' | 'bulk_renew',
  originalQuery: string,
  answers: Record<string, unknown>,
): Extract<AiAction, { intent: 'find_names' | 'bulk_renew' }> | null => {
  if (!hasValidJevNameSearchFacets(answers)) return null
  const context = readNameSelectionContext(intent, originalQuery, answers)
  if (!context) return null
  const { query, duration, literalProof, expiryWindowNotApplicable } = context
  if (duration.targetDate && !literalProof) return null
  const literalAgreement =
    literalProof !== null || hasExactVersionSelectionAgreement(query, answers)
  if (!hasSupportedSelectionConstraints(answers, literalAgreement)) return null
  const names = extractEnsNames(query)
  if (names.some((name) => isExplicitlyExcludedAiTarget(query, name)))
    return null
  const redactedSelection = normalizeNegativeNameSelection(
    redactAiQuery(query, names),
  )
  const filters = parseJevNameSelectionFacets(
    answers,
    redactedSelection,
    expiryWindowNotApplicable,
  )
  if (!filters) return null
  const hasFilters = Object.keys(filters).length > 0
  const referencedSelection = /\b(?:those|these|selected)(?:\s+names)?\b/i.test(
    redactedSelection,
  )
  const bareReference = new RegExp(
    `^(?:please\\s+)?${intent === 'bulk_renew' ? '(?:renew|extend)' : '(?:show|find|list)'}\\s+(?:(?:those|these)(?:\\s+selected)?|selected)(?:\\s+names)?[.!?]?$`,
    'i',
  ).test(query.trim())
  const allNames =
    literalProof?.scope.kind === 'all' ||
    /^(?:please\s+)?(?:show|find|list|display|renew|extend)(?:\s+me)?\s+(?:(?:all\s+(?:of\s+)?)?(?:my|the)\s+|(?:all|every)\s+)?(?:names?|domains?)(?:\s+(?:please|in\s+(?:my|this|the)\s+(?:connected\s+)?wallet))?[.!?]?$/i.test(
      query.trim(),
    )
  const literalNameList =
    /^(?:please\s+)?(?:renew|extend|show|find|list)(?:\s+(?:my|these|the|names))?\s+\[ENS_NAME\](?:(?:\s*(?:,|and|&)\s*)\[ENS_NAME\])*[.!?]?$/i.test(
      redactAiQuery(query),
    )
  const exactSelection =
    names.length > 0 &&
    (hasFilters || literalNameList || literalProof?.scope.kind === 'exact') &&
    hasSupportedSelectionConstraints(answers, literalAgreement)
  if (
    !hasFilters &&
    !allNames &&
    !exactSelection &&
    !(
      referencedSelection &&
      (bareReference || literalProof?.scope.kind === 'reference')
    )
  )
    return null
  return {
    intent,
    filters,
    ...duration,
    ...(referencedSelection && { referencedSelection: true }),
    ...(!hasFilters && allNames && { allNames: true }),
    ...(exactSelection && { names }),
  }
}

const readNameSelectionContext = (
  intent: 'find_names' | 'bulk_renew',
  originalQuery: string,
  answers: Record<string, unknown>,
) => {
  const split: { selection: string; duration: ActionDuration } | null =
    intent === 'bulk_renew'
      ? splitBulkSelectionDuration(originalQuery, answers)
      : { selection: originalQuery, duration: {} }
  if (!split) return null
  const query = split.selection
  const addedDurationRemoved =
    query !== originalQuery &&
    Boolean(
      split.duration.durationDays ||
        split.duration.durationYears ||
        split.duration.targetDate ||
        split.duration.durationAmount,
    )
  const literalProof = readLiteralSelectionProof(
    query,
    answers,
    addedDurationRemoved,
  )
  return {
    query,
    duration: split.duration,
    literalProof,
    // Applicability settles only the window/selection question. Generic global
    // support retains its original requirement that the raw window also agrees.
    hasStrictLiteralAgreement:
      readLiteralSelectionProof(query, answers) !== null,
    expiryWindowNotApplicable:
      addedDurationRemoved &&
      literalProof !== null &&
      literalProof.filters.expiry !== 'expiring' &&
      literalProof.filters.withinDays === undefined,
  }
}

const parseMigration = (
  query: string,
  answers: Record<string, unknown>,
): Extract<AiAction, { intent: 'migrate' }> | null =>
  parseMigrationIntent(query, answers, extractEnsNames(query))

const notificationPreferencePatterns = [
  ['favouritedNameExpiry', /\b(?:favou?rit\w*|starred)\b/i],
  ['ensLabsUpdates', /\b(?:news|updates|ens labs)\b/i],
  ['ownedNameExpiry', /\b(?:owned|my names?)\b/i],
] as const

const getNotificationEnabled = (
  query: string,
  answers: Record<string, unknown>,
) => {
  const wantsOff = /\b(?:off|disable|stop|unsubscribe|mute|silence)\b/i.test(
    query,
  )
  const wantsOn = /\b(?:on|enable|subscribe|unmute|resume)\b/i.test(query)
  if (wantsOn && wantsOff) return undefined
  if (wantsOff) return false
  if (wantsOn) return true
  const operation = readDetailChoice(answers, 'notification_operation', [
    'enable',
    'disable',
    'unclear',
  ])
  if (operation === 'enable') return true
  if (operation === 'disable') return false
  return undefined
}

const parseNotification = (
  query: string,
  answers: Record<string, unknown>,
): Extract<AiAction, { intent: 'notification' }> | null => {
  if (hasUnsupportedNotificationSchedule(query)) return null
  const literalPreferences = notificationPreferencePatterns.filter(
    ([, pattern]) => pattern.test(query),
  )
  if (literalPreferences.length > 1) return null
  const preference =
    literalPreferences[0]?.[0] ??
    readDetailChoice(answers, 'notification_preference', [
      'favouritedNameExpiry',
      'ownedNameExpiry',
      'ensLabsUpdates',
    ] as const) ??
    undefined
  return {
    intent: 'notification',
    preference,
    enabled: getNotificationEnabled(query, answers),
  }
}

const parseAction = (
  intent: AiIntent,
  query: string,
  answers: Record<string, unknown>,
): AiAction | null => {
  const name = extractEnsNames(buildProfileValueContext(query).targetQuery)[0]
  switch (intent) {
    case 'set_primary':
    case 'favorite':
    case 'view_name':
      return { intent, ...(name && { name }) }
    case 'register':
      return parseRegistration(name, query, answers)
    case 'renew':
      return parseRenewal(name, query, answers)
    case 'find_names':
    case 'bulk_renew':
      return parseNameSelection(intent, query, answers)
    case 'migrate':
      return parseMigration(query, answers)
    case 'edit_profile':
      return parseProfileSection(query, name, answers)
    case 'notification':
      return parseNotification(query, answers)
    case 'manager_action':
      return parseManagerAction(query, answers, extractEnsNames(query))
  }
}

const supportsAiQuery = (
  intent: AiIntent,
  query: string,
  supported: number,
  unsupported: number,
  answers: Record<string, unknown>,
): boolean =>
  (supported >= 0.5 && unsupported < 0.5) ||
  (['renew', 'favorite', 'view_name'].includes(intent) &&
    supported >= 0.15 &&
    unsupported < 0.85 &&
    isDirectSupportedPrompt(intent, query)) ||
  (supported >= 0.2 &&
    unsupported < 0.6 &&
    (isDirectSupportedPrompt(intent, query) ||
      (intent === 'edit_profile' &&
        hasCompleteSocialRequestEvidence(query, answers))))

const hasSupportedActionCount = (
  query: string,
  actionCount: unknown,
): boolean => {
  // A warning about more actions must not disappear because its confidence
  // is below the positive-choice threshold. We can only explain two steps.
  if (
    actionCount !== undefined &&
    (!isRecord(actionCount) ||
      actionCount.type !== 'choice' ||
      !['one', 'two', 'many'].includes(String(actionCount.choice)) ||
      typeof actionCount.confidence !== 'number' ||
      !Number.isFinite(actionCount.confidence) ||
      actionCount.confidence < 0 ||
      actionCount.confidence > 1 ||
      actionCount.choice === 'many')
  )
    return false
  const explicitFollowingActions = query.match(
    /\b(?:and\s+then|then|and\s+also)\s+(?:set|register|renew|extend|upgrade|migrate|add|favou?rit\w*|show|turn|edit|remove|delete)\b/gi,
  )
  if (explicitFollowingActions && explicitFollowingActions.length > 1)
    return false
  return true
}

const hasClearActionRequest = (
  query: string,
  answers: Record<string, unknown>,
  intent: AiIntent | 'unsupported' | 'none' | null,
  singleMigration: boolean,
): boolean => {
  const mode = readDetailChoice(answers, 'request_mode', [
    'requested',
    'negated',
    'unclear',
  ])
  const count = readDetailChoice(answers, 'action_count', [
    'one',
    'two',
    'many',
  ])
  if (!hasSupportedActionCount(query, answers.action_count)) return false
  const requestMode = answers.request_mode
  // A clear imperative can resolve Jev treating "disable" as negation,
  // but it cannot override explicit uncertainty or malformed response data.
  if (
    requestMode !== undefined &&
    (!isRecord(requestMode) ||
      requestMode.type !== 'choice' ||
      !['requested', 'negated', 'unclear'].includes(
        String(requestMode.choice),
      ) ||
      typeof requestMode.confidence !== 'number' ||
      !Number.isFinite(requestMode.confidence) ||
      requestMode.confidence < 0 ||
      requestMode.confidence > 1 ||
      requestMode.choice === 'unclear')
  )
    return false
  if (
    /\b(?:never\s*mind|leave\s+(?:it|them|things)\s+(?:connected|unchanged|as\b)|keep\s+(?:it|them|things)\s+(?:connected|unchanged|as\b))\b/i.test(
      query,
    )
  )
    return false
  // Disabling reminders is itself an affirmative action. A literal command
  // settles its polarity even if Jev confuses 'off' with prohibiting the action.
  const explicitNotificationCommand =
    intent === 'notification' &&
    /^(?:please\s+)?(?:(?:turn|switch)\b.*\b(?:on|off)\b|mute|unmute|enable|disable|disabel|subscribe|unsubscribe|stop(?:\s+sending)?|silence|resume)\b/i.test(
      query.trim(),
    )
  const explicitManagerCommand =
    intent === 'manager_action' &&
    /^(?:please\s+)?(?:unstar|unfavou?rit\w*|remove|delete|disconnect|resend|resned|disable|disabel|enable|turn|connect|add|copy|share|revoke|download|open|show)\b/i.test(
      query.trim(),
    )
  // A literal upgrade command with a fully represented migration selection
  // resolves weak requested-mode confidence caused by a subset exclusion.
  // Explicit prohibitions and uncertain/contradictory modes still fail above.
  const explicitMigrationCommand = intent === 'migrate' && singleMigration
  if (
    explicitNotificationCommand ||
    explicitManagerCommand ||
    explicitMigrationCommand
  )
    return !hasNegatedAction(query) && count !== 'many'
  return (
    !hasNegatedAction(query) &&
    mode !== 'negated' &&
    mode !== 'unclear' &&
    (answers.request_mode === undefined || mode !== null) &&
    count !== 'many'
  )
}

const readNextIntent = (
  answers: Record<string, unknown>,
  multi: number,
): AiIntent | null | undefined => {
  if (multi < 0.7) return undefined
  const next = readChoice(answers, 'next_intent')
  return !next || next === 'none' || next === 'unsupported' ? null : next
}

const isConfidentReferencedBulkRenew = (
  intent: AiIntent,
  query: string,
  supported: number,
  unsupported: number,
  answers: Record<string, unknown>,
): boolean => {
  const intentAnswer = answers.intent
  return (
    intent === 'bulk_renew' &&
    isExactReferencedBulkRenew(query) &&
    supported >= 0.5 &&
    unsupported < 0.85 &&
    isRecord(intentAnswer) &&
    intentAnswer.type === 'choice' &&
    intentAnswer.choice === 'bulk_renew' &&
    typeof intentAnswer.confidence === 'number' &&
    intentAnswer.confidence >= 0.8
  )
}

const isSingleExactCollectionAction = (
  intent: AiIntent,
  query: string,
  answers: Record<string, unknown>,
): boolean => {
  if (intent !== 'bulk_renew' && intent !== 'migrate') return false
  const selection =
    intent === 'bulk_renew'
      ? splitBulkSelectionDuration(query, answers)?.selection
      : query
  if (!selection || extractEnsNames(selection).length < 2) return false
  const verbs = intent === 'bulk_renew' ? 'renew|extend' : 'upgrade|migrate'
  // Multiple explicit targets joined by AND are one operation. The complete
  // grammar cannot hide a second verb, alternative, exclusion, or extra clause.
  return new RegExp(
    `^(?:please\\s+)?(?:${verbs})\\s+\\[ENS_NAME\\](?:(?:\\s*(?:,|and|&)\\s*)\\[ENS_NAME\\])+[.!?]?$`,
    'i',
  ).test(redactAiQuery(selection).trim())
}

const hasCompleteSingleSelection = (
  intent: AiIntent,
  query: string,
  answers: Record<string, unknown>,
  multi: number,
): boolean => {
  if (
    (intent !== 'find_names' && intent !== 'bulk_renew') ||
    multi > 0.3 ||
    readChoice(answers, 'next_intent') !== 'none'
  )
    return false
  const context = readNameSelectionContext(intent, query, answers)
  return (
    context?.hasStrictLiteralAgreement === true &&
    parseNameSelection(intent, query, answers) !== null
  )
}

const readAiDecision = (
  answers: Record<string, unknown>,
  query: string,
  uncertainFirstIntent?: AiIntent,
): { intent: AiIntent; nextIntent?: AiIntent } | null => {
  const supported = readNoul(answers, 'fully_supported')
  const unsupported = readNoul(answers, 'unsupported_requirement')
  const multi = readNoul(answers, 'multi_action')
  const intent = readAiIntent(answers, query, uncertainFirstIntent)
  const instruction = redactAiQuery(withoutQuotedValues(query))
  const singleMigration =
    intent === 'migrate' &&
    isSingleMigrationIntent(query, answers, extractEnsNames(query))
  if (
    !hasClearActionRequest(instruction, answers, intent, singleMigration) ||
    supported === null ||
    unsupported === null ||
    multi === null ||
    (multi > 0.3 && multi < 0.7 && !singleMigration) ||
    (hasSecondActionCue(instruction) && multi < 0.7) ||
    !intent ||
    intent === 'none' ||
    intent === 'unsupported'
  ) {
    return null
  }
  const confidentReferencedBulkRenew = isConfidentReferencedBulkRenew(
    intent,
    query,
    supported,
    unsupported,
    answers,
  )
  // Complete local clause coverage and matching model facets can settle a
  // generic capability vote. Unknown wording keeps the usual semantic gates.
  const supportedSelection = hasCompleteSingleSelection(
    intent,
    query,
    answers,
    multi,
  )
  if (
    !confidentReferencedBulkRenew &&
    !supportedSelection &&
    !supportsAiQuery(intent, query, supported, unsupported, answers)
  )
    return null
  const singleProfileEdit =
    intent === 'edit_profile' &&
    isSingleProfileEdit(
      query,
      extractEnsNames(buildProfileValueContext(query).targetQuery)[0],
      answers,
    )
  const singleExactCollection = isSingleExactCollectionAction(
    intent,
    query,
    answers,
  )
  if (
    multi < 0.7 &&
    readDetailChoice(answers, 'action_count', ['one', 'two', 'many']) ===
      'two' &&
    !singleProfileEdit &&
    !singleExactCollection &&
    !singleMigration
  )
    return null
  if (
    intent !== 'find_names' &&
    !singleMigration &&
    !singleProfileEdit &&
    !singleExactCollection &&
    /\band\b/i.test(instruction) &&
    multi < 0.7 &&
    readDetailChoice(answers, 'action_count', ['one', 'two', 'many']) !== 'one'
  )
    return null

  const nextIntent = readNextIntent(answers, multi)
  if (nextIntent === null) return null
  if (
    isRegisterThenPrimary(query) &&
    (intent !== 'register' || nextIntent !== 'set_primary')
  )
    return null
  return { intent, ...(nextIntent && { nextIntent }) }
}

const firstActionQuery = (query: string): string => {
  const masked = query.replace(
    /"[^"]*"|(?<![\p{L}\p{N}])'[^']*'|“[^”]*”|‘[^’]*’/gu,
    (value) => ' '.repeat(value.length),
  )
  const separator = /\b(?:and\s+then|then|and\s+also)\b/i.exec(masked)
  return separator ? query.slice(0, separator.index).trim() : query
}

type NamedAiAction = Extract<
  AiAction,
  {
    intent:
      | 'set_primary'
      | 'register'
      | 'renew'
      | 'edit_profile'
      | 'favorite'
      | 'view_name'
  }
>

const isNamedAiAction = (action: AiAction): action is NamedAiAction =>
  action.intent === 'set_primary' ||
  action.intent === 'register' ||
  action.intent === 'renew' ||
  action.intent === 'edit_profile' ||
  action.intent === 'favorite' ||
  action.intent === 'view_name'

const bindActionTarget = (
  action: AiAction,
  query: string,
  answers: Record<string, unknown>,
): AiAction | null => {
  if (!isNamedAiAction(action)) return action
  const targetQuery = buildProfileValueContext(query).targetQuery
  const names = extractEnsNames(targetQuery)
  if (names.length <= 1)
    return action.name && isExplicitlyExcludedAiTarget(targetQuery, action.name)
      ? null
      : action
  const target = readDetailChoice(
    answers,
    'target_name',
    names.map((_, index) => `name_${index + 1}`),
  )
  if (/\bor\b/i.test(redactAiQuery(withoutQuotedValues(query))) || !target)
    return { ...action, name: undefined, nameCandidates: names }
  const selectedName = names[Number(target.slice(5)) - 1]
  if (!selectedName || isExplicitlyExcludedAiTarget(targetQuery, selectedName))
    return null
  return { ...action, name: selectedName }
}

const parseAiResponse = (
  response: unknown,
  query: string,
  uncertainFirstIntent?: AiIntent,
): Extract<AiInterpretResult, { status: 'ok' }> | null => {
  if (!isRecord(response) || !isRecord(response.answers)) return null
  const answers = response.answers
  const decision = readAiDecision(answers, query, uncertainFirstIntent)
  if (!decision || hasUnsupportedAction(query, decision.intent)) return null
  if (
    startsProfileOwnerQuestion(query) &&
    (!hasCompleteProfileOwnerViewRequest(query) ||
      decision.intent !== 'manager_action')
  )
    return null
  const firstQuery = decision.nextIntent ? firstActionQuery(query) : query
  if (
    decision.intent === 'view_name' &&
    /\b(?:share|shrae|shar|copy|clipboard|qr)\b/i.test(
      redactAiQuery(firstQuery),
    )
  )
    return null
  if (
    hasExplicitNameActionConflict(firstQuery, decision.intent) ||
    hasProfileActionConflict(firstQuery, decision.intent, answers)
  )
    return null
  const parsedAction = parseAction(decision.intent, firstQuery, answers)
  if (!parsedAction) return null
  const action = bindActionTarget(parsedAction, firstQuery, answers)
  if (!action) return null
  return {
    status: 'ok',
    action,
    ...(decision.nextIntent && {
      multiAction: { nextIntent: decision.nextIntent },
    }),
  }
}

export const parseJevAiResponse = (
  response: unknown,
  query: string,
): Extract<AiInterpretResult, { status: 'ok' }> | null =>
  parseAiResponse(response, query)

/** Internal construction only. The returned interpretation is not approved to act. */
export const parseUncertainJevAiResponse = (
  response: unknown,
  query: string,
) => {
  if (!isRecord(response) || !isRecord(response.answers)) return null
  const answer = response.answers.intent
  if (
    !isRecord(answer) ||
    answer.type !== 'choice' ||
    typeof answer.choice !== 'string' ||
    !Object.hasOwn(intents, answer.choice) ||
    answer.choice === 'unsupported' ||
    typeof answer.confidence !== 'number' ||
    !Number.isFinite(answer.confidence) ||
    answer.confidence < 0 ||
    answer.confidence >= 0.55
  )
    return null
  // Existing deterministic exceptions already accept some low-scoring inputs.
  // They do not need a second interpretation or a verification request.
  if (parseAiResponse(response, query)) return null
  const choice = answer.choice as AiIntent
  const interpretation = parseAiResponse(response, query, choice)
  return interpretation
    ? { interpretation, choice, confidence: answer.confidence }
    : null
}
