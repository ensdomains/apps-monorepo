import {
  getQuantityCandidates,
  hasInvalidQuantitySyntax,
} from '@/utils/naturalLanguageQuantity'
import type { SmartNameFilters } from '../smartNameSearch'
import { normalizeNegativeNameSelection } from './nameSearchLanguage'

const choices = {
  expiry: {
    any: 'No expiry condition requested.',
    expiring:
      'A name whose expiry is approaching, including a stated number of days.',
    active: 'Not yet expired, with a known future expiry.',
    expired: 'Already expired, whether in or past its grace period.',
    'in-grace':
      'Names in grace or in the grace period: expired but still inside the registrar grace period. Includes "grace period names".',
    'past-grace': 'The grace period has ended.',
    'non-expiring': 'Explicitly has no expiry date.',
  },
  role: {
    any: 'No owner or manager role requested.',
    owner: 'The connected wallet is an owner.',
    manager:
      'The connected wallet is a manager: manager names or names I manage.',
  },
  version: {
    any: 'No ENS version requested.',
    v1: 'ENSv1 names.',
    v2: 'ENSv2 names.',
  },
  upgrade: {
    any: 'No upgrade eligibility requested.',
    eligible: 'ENSv1 names eligible for upgrade.',
    ineligible: 'ENSv1 names not eligible for upgrade.',
  },
  favorite: {
    any: 'No favorite status requested.',
    yes: 'Names marked as favorites.',
    no: 'Names not marked as favorites.',
  },
  primary: {
    any: 'No primary-name condition. "My names", wallet ownership, favourites, or expiry alone do not request the primary name.',
    yes: 'Explicitly the wallet primary, main, or reverse name, or its public naming identity. Not merely "my names".',
    no: 'Explicitly excludes the wallet primary/main/reverse name. Excluding favourites does not exclude the primary name.',
  },
  sort: {
    any: 'No ordering requested. Filtering names expiring soon or within N days is not a request to sort.',
    'name-asc': 'Alphabetical name order.',
    'name-desc': 'Reverse alphabetical name order.',
    'created-asc': 'Oldest names first.',
    'created-desc': 'Newest names first.',
    'expiry-asc':
      'An explicit order: soonest/earliest expiry first. Not merely filtering names expiring soon.',
    'expiry-desc': 'Latest expiry first.',
  },
} as const

type Facet = keyof typeof choices

const facetInstructions: Record<Facet, string> = {
  expiry:
    'Which expiry condition selects the requested names? "Grace period names" or "names in grace" requests in-grace. Past or after grace requests past-grace. Adding renewal time (renew, extend, or keep names for N days/weeks/years) does NOT request an expiry filter: choose any unless a separate expiry/grace selection is stated. Choose any if no expiry or grace condition is requested.',
  role: 'Which wallet role does the user explicitly request? Choose any if none.',
  version:
    'Which ENS version does the user explicitly request? Choose any if none.',
  upgrade:
    'Which upgrade eligibility does the user explicitly request? Choose any unless they ask about eligibility, ability/readiness to upgrade or migrate, or ineligibility. ENSv1, expired, past grace, owner and manager status alone never request an eligibility filter. Do not infer eligibility from another name property.',
  favorite:
    'Which favorite status does the user explicitly request? Choose any if none.',
  primary:
    'Does the user request their primary/main/reverse name or exclude it? Choose any for "my names", ownership, favourite, expiry, or version conditions without a primary-name condition.',
  sort: 'Which result order does the user explicitly request? Choose any if none.',
}

const searchCapabilities =
  'Manager can filter wallet names by: approaching expiry (soon or within any positive whole number of days); active; expired; currently in the registrar grace period; past the grace period; explicitly non-expiring; owner or manager role; ENSv1 or ENSv2; eligible or ineligible for upgrade; favourite or not favourite; primary or not primary. It can sort by name, creation time, or expiry. A single status request such as names in grace or grace period names is fully supported. Combining supported conditions with AND and optionally sorting is supported. These are read-only filters over loaded names; the user need not know a particular name.'

export const buildJevNameSearchRequest = (query: string) => ({
  model: 'jev-latest',
  state: normalizeNegativeNameSelection(query),
  questions: {
    search_shape: {
      type: 'choice',
      instructions:
        'What logical relationship is requested between name-search conditions? This asks about logic, not which filters exist. Default to conjunction for a single condition, multiple conditions all required, sorting, or no search conditions. Only choose another option when the request explicitly has that relationship. Excluding favourites or the primary name is a supported negative condition combined with AND, including renewing those previously selected names except favourites. A future cutoff within N days is one condition, not a between-bounds range. Understand everyday language and typos.',
      criteria: {
        conjunction:
          'Default: all requested conditions must hold. Includes a single condition such as in grace, favorites, owner or primary; combining ENS version with ordering; one future cutoff within N days; sorting alone; and a previous selection excluding favourites/primary names.',
        alternatives:
          'Explicit alternatives: names satisfying either one condition OR another, rather than requiring both.',
        bounded_range:
          'An interval with both lower AND upper bounds, such as between 10 and 20 days. NOT a future cutoff within N days.',
        unknown_expiry:
          'Specifically names with unknown, missing, or unset expiry data. Not names explicitly marked as non-expiring.',
      },
    },
    expiry_window: {
      type: 'choice',
      instructions:
        'Does the name search specify a future expiry cutoff? Understand typos in days. A positive whole day count is positive_days even when other filters or sorting are also requested. Classify the expiry cutoff only; ENS versions and other filters are irrelevant. Sorting alone and renewing/registering a name do not set a search cutoff.',
      criteria: {
        none: 'No future expiry cutoff. Includes grace, expired, active, non-expiring, role, version, favourite, primary, upgrade and sorting-only requests.',
        soon: 'Expiring soon or approaching expiry, without a number of days.',
        positive_days:
          'Names expiring in/within the next N days, or N days from now, with one positive whole number N. May also request role, version, favourites, or ordering.',
        unsupported:
          'Expiry between two bounds; expiry on a fixed calendar date; more than/at least N days; negative/fractional counts; weeks/months/years or days ago. A simple future positive day count is NOT unsupported.',
      },
    },
    fully_supported: {
      type: 'noul',
      instructions: `${searchCapabilities} Can every requested constraint be represented by these filters and sorts? Answer no only if an explicit requirement is outside this list: name meaning/text fragments, a calendar date, both lower and upper time bounds, OR conditions, or other properties. An approaching-expiry cutoff within N days is supported. Names in grace is supported without an expiry day count.`,
      criteria: {
        true: 'Every requested constraint has a matching dashboard filter or sort.',
        false: 'At least one requested constraint cannot be represented.',
      },
    },
    unsupported_requirement: {
      type: 'noul',
      instructions: `${searchCapabilities} Does the request explicitly include any other requirement? Ignore generic words such as show, list, my, names, only, are, that. Name meaning/topic, text contained in a name, calendar dates, OR alternatives, or unrelated properties are unsupported. Names in grace, names past grace, favourites, names I manage, primary name, and sorting by expiry have no unsupported requirement.`,
      criteria: {
        true: 'At least one requested constraint is outside those dashboard properties.',
        false: 'All constraints refer only to those dashboard properties.',
      },
    },
    ...Object.fromEntries(
      (Object.keys(facetInstructions) as Facet[]).map((facet) => [
        facet,
        {
          type: 'choice',
          instructions: `${facetInstructions[facet]} Understand paraphrases, casual English, shorthand, and minor spelling mistakes. Select only a condition actually requested; unrelated facets must be any. Sorting by expiry does not request expiring names, and excluding favourites does not exclude the primary name. Unknown or missing expiry is not explicitly non-expiring.`,
          criteria: choices[facet],
        },
      ]),
    ),
  },
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const readChoice = <K extends keyof typeof choices>(
  answers: Record<string, unknown>,
  key: K,
): keyof (typeof choices)[K] | null => {
  const answer = answers[key]
  if (!isRecord(answer) || answer.type !== 'choice') return null
  if (typeof answer.choice !== 'string') return null
  if (
    typeof answer.confidence !== 'number' ||
    !Number.isFinite(answer.confidence) ||
    answer.confidence < 0 ||
    answer.confidence > 1
  ) {
    return null
  }
  if (!Object.hasOwn(choices[key], answer.choice)) return null
  return answer.choice as keyof (typeof choices)[K]
}

const readFacetChoice = <K extends Facet>(
  answers: Record<string, unknown>,
  key: K,
): keyof (typeof choices)[K] | null => {
  const choice = readChoice(answers, key)
  if (!choice) return null
  const confidence = (answers[key] as { confidence: number }).confidence
  return choice !== 'any' && confidence < 0.35 ? null : choice
}

const parseWrittenDayCount = (
  query: string,
  inferDayUnit: boolean,
): number | null | 'invalid' => {
  const candidates = getQuantityCandidates(query)
  const dayCounts = candidates.filter(({ index, text }) =>
    /^\s+(?:more\s+)?days?\b/i.test(query.slice(index + text.length)),
  )
  if (dayCounts.length === 0)
    return inferDayUnit || /\bdays?\b/i.test(query) ? 'invalid' : null
  if (dayCounts.length !== 1 || candidates.length !== 1) return 'invalid'
  const quantity = dayCounts[0]
  if (!quantity) return 'invalid'
  const prefix = query.slice(0, quantity.index)
  if (
    /(?:[+−﹣－-]\s*|\b(?:minus|negative)\s+)$/i.test(prefix) ||
    /\b(?:ago|between|at\s+least|more\s+than|less\s+than|fewer\s+than|greater\s+than|half|quarter|point|million|billion)\b/i.test(
      query.replace(/\S*[.@]\S*/g, '').replace(/\bfrom\s+now\b/gi, ''),
    )
  )
    return 'invalid'
  return Number.isSafeInteger(quantity.value) && quantity.value > 0
    ? quantity.value
    : 'invalid'
}

export const parseExplicitDayCount = (
  query: string,
  inferDayUnit = false,
): number | null | 'invalid' => {
  const quantities = getQuantityCandidates(query)
  if (
    hasInvalidQuantitySyntax(query, quantities) ||
    quantities.some(({ index }) =>
      /\b(?:after|beyond|from)\s*$/i.test(query.slice(0, index)),
    )
  )
    return 'invalid'
  const dayMentions = [
    ...query.matchAll(/(?<![\w.,])([+-]?[\d,.]+)\s+(?:more\s+)?days?\b/gi),
  ]
  const amounts = inferDayUnit
    ? [...query.matchAll(/(?<![\w.,])([+-]?[\d,.]+)(?![\w.,])/g)]
    : dayMentions
  if (amounts.length === 0) return parseWrittenDayCount(query, inferDayUnit)
  if (amounts.length !== 1) return 'invalid'
  if (quantities.length !== 1) return 'invalid'
  if (
    /\b(?:ago|between|from\s+\d|at\s+least|(?:more|less|fewer|greater)\s+than)\b/i.test(
      query,
    ) ||
    /\b\d+\s*(?:-|–|—|to|and)\s*\d+\s+days?\b/i.test(query) ||
    /[+-]\s+\d/.test(query)
  )
    return 'invalid'
  const amount = amounts[0]?.[1]
  if (!amount || !/^\d+$/.test(amount)) return 'invalid'
  const days = Number(amount)
  return Number.isSafeInteger(days) && days > 0 ? days : 'invalid'
}

const explicitRole = (
  query: string,
): 'owner' | 'manager' | null | 'invalid' => {
  const owner = /\b(owner|owned|own|registrant)\b/i.test(query)
  const manager =
    /\b(manager|manage|managed|controller|control|controls)\b/i.test(query)
  if (owner && manager) return 'invalid'
  return owner ? 'owner' : manager ? 'manager' : null
}

const explicitVersion = (query: string): 'v1' | 'v2' | null | 'invalid' => {
  const v1 = /\b(?:ens[\s-]*)?v(?:ersion)?[\s-]*1\b/i.test(query)
  const v2 = /\b(?:ens[\s-]*)?v(?:ersion)?[\s-]*2\b/i.test(query)
  if (v1 && v2) return 'invalid'
  return v1 ? 'v1' : v2 ? 'v2' : null
}

const hasSortCue = (query: string): boolean =>
  /\b(sort\w*|order\w*|first|last|ascending|descending|alphabetic\w*|newest|oldest|soonest|latest)\b/i.test(
    query,
  )

const explicitFavorite = (query: string): 'yes' | 'no' | null => {
  if (!/\bfavou?rites?\b/i.test(query)) return null
  return /\b(?:not|non|without|except|exclude|excluding)[\s-]+(?:my\s+)?favou?rites?\b/i.test(
    query,
  )
    ? 'no'
    : 'yes'
}

const explicitPrimary = (query: string): 'yes' | 'no' | null => {
  if (!/\bprimary\b/i.test(query)) return null
  return /\b(?:not|non|without|except|exclude|excluding)[\s-]+(?:my\s+)?primary\b/i.test(
    query,
  )
    ? 'no'
    : 'yes'
}

const explicitUpgrade = (query: string): 'eligible' | 'ineligible' | null => {
  if (/\b(?:ineligible|not eligible|not upgradeable)\b/i.test(query))
    return 'ineligible'
  if (/\b(?:cannot|can't|can not|not able to)\s+upgrade\b/i.test(query))
    return 'ineligible'
  if (/\b(?:eligible|upgradeable)\b/i.test(query)) return 'eligible'
  if (/\b(?:can(?: i)?|able to|ready to)\s+upgrade\b/i.test(query))
    return 'eligible'
  return null
}

const hasExpiryStatusCue = (query: string): boolean =>
  /\b(expir(?:es?|ed|ing)|grace|non-expiring|active|soon)\b/i.test(query) ||
  /\bexpiry\b.*\b(?:soon|within|next)\b/i.test(query)

const explicitExpiry = (
  query: string,
  withinDays: number | null,
): ParsedFacets['expiry'] | null => {
  if (
    /\b(?:past|after|out of|outside)\s+(?:(?:the|their|its)\s+)?grace\b/i.test(
      query,
    )
  )
    return 'past-grace'
  if (/\b(?:passed|beyond)\s+(?:(?:the|their|its)\s+)?grace\b/i.test(query))
    return 'past-grace'
  if (
    /\bgrace(?:\s+period)?\s+(?:(?:has|is)\s+)?(?:ended|over|finished|elapsed)\b/i.test(
      query,
    )
  )
    return 'past-grace'
  if (/\bgrace\b/i.test(query)) return 'in-grace'
  if (
    /\b(?:non-expiring|never expir(?:e|es)|do(?:es)? not expire|don['’]t expire|doesn['’]t expire|no expiry)\b/i.test(
      query,
    )
  )
    return 'non-expiring'
  if (/\b(?:not expired|active)\b/i.test(query)) return 'active'
  if (/\bexpired\b/i.test(query)) return 'expired'
  if (withinDays !== null || /\b(?:expiring|expires?|soon)\b/i.test(query))
    return 'expiring'
  return null
}

const explicitSort = (query: string): ParsedFacets['sort'] | null => {
  if (!hasSortCue(query)) return null
  if (/\b(?:newest|oldest|created)\b/i.test(query))
    return /\b(?:newest|latest|descending)\b/i.test(query)
      ? 'created-desc'
      : 'created-asc'
  if (/\b(?:expiry|expiration|soonest|latest)\b/i.test(query))
    return /\b(?:latest|descending)\b/i.test(query)
      ? 'expiry-desc'
      : 'expiry-asc'
  if (/\b(?:name|alphabetic\w*|a to z|z to a)\b/i.test(query))
    return /\b(?:reverse|descending|z to a)\b/i.test(query)
      ? 'name-desc'
      : 'name-asc'
  return null
}

const readSupportedAnswers = (
  response: unknown,
  query: string,
): Record<string, unknown> | null => {
  if (!isRecord(response) || !isRecord(response.answers)) return null
  const answers = response.answers
  const support = answers.fully_supported
  if (
    !isRecord(support) ||
    support.type !== 'noul' ||
    typeof support.noul !== 'number' ||
    !Number.isFinite(support.noul) ||
    support.noul < 0 ||
    support.noul > 1
  ) {
    return null
  }
  const unsupported = answers.unsupported_requirement
  if (
    !isRecord(unsupported) ||
    unsupported.type !== 'noul' ||
    typeof unsupported.noul !== 'number' ||
    !Number.isFinite(unsupported.noul) ||
    unsupported.noul < 0 ||
    unsupported.noul >= 0.85
  ) {
    return null
  }
  if (
    support.noul < 0.3 &&
    !(
      support.noul >= 0.2 &&
      unsupported.noul < 0.5 &&
      hasExactGraceAgreement(query, answers)
    )
  )
    return null
  return answers
}

const hasExactGraceAgreement = (
  query: string,
  answers: Record<string, unknown>,
): boolean => {
  const text = query.trim().replace(/[.!?]+$/, '')
  const match = text.match(
    /^(?:(?:please\s+)?(?:show|list|find)\s+)?(?:(?:all|my|the)\s+)*(?:(?:names|domains)\s+(in|past|after)\s+(?:the\s+)?grace(?:\s+period)?|grace(?:\s+period)?\s+(?:names|domains))$/i,
  )
  if (!match) return false
  const expected =
    match[1] && /^(?:past|after)$/i.test(match[1]) ? 'past-grace' : 'in-grace'
  const expiry = answers.expiry
  return (
    readChoice(answers, 'expiry') === expected &&
    isRecord(expiry) &&
    typeof expiry.confidence === 'number' &&
    expiry.confidence >= 0.9 &&
    (Object.keys(choices) as Facet[]).every(
      (key) => key === 'expiry' || readChoice(answers, key) === 'any',
    )
  )
}

const readFacets = (answers: Record<string, unknown>) => {
  const expiry = readFacetChoice(answers, 'expiry')
  const role = readFacetChoice(answers, 'role')
  const version = readFacetChoice(answers, 'version')
  const upgrade = readFacetChoice(answers, 'upgrade')
  const favorite = readFacetChoice(answers, 'favorite')
  const primary = readFacetChoice(answers, 'primary')
  const sort = readFacetChoice(answers, 'sort')
  if (
    !expiry ||
    !role ||
    !version ||
    !upgrade ||
    !favorite ||
    !primary ||
    !sort
  ) {
    return null
  }
  return { expiry, role, version, upgrade, favorite, primary, sort }
}

export const hasValidJevNameSearchFacets = (answers: unknown): boolean =>
  isRecord(answers) && readFacets(answers) !== null

type ParsedFacets = NonNullable<ReturnType<typeof readFacets>>

const hasUnrepresentedCue = (query: string, facets: ParsedFacets): boolean =>
  (facets.expiry === 'any' && hasExpiryStatusCue(query)) ||
  (facets.upgrade === 'any' && /\bupgrad\w*\b/i.test(query)) ||
  (facets.favorite === 'any' && /\b(?:starred|bookmarked)\b/i.test(query)) ||
  (facets.primary === 'any' && /\b(?:main|reverse)\s+name\b/i.test(query)) ||
  (facets.role === 'any' && /\b(?:role|permission)\b/i.test(query)) ||
  (facets.version === 'any' && /\b(?:ens\s+)?version\b/i.test(query)) ||
  (facets.sort === 'any' && hasSortCue(query))

const hasExplicitUnsupportedConstraint = (query: string): boolean =>
  /\b(?:names?|domains?)\s+about\b(?!\s+to\s+expir)/i.test(query) ||
  /\b(?:meanings?|rhym\w*|contain\w*|characters?|letters?|price|cost|starts? with|ends? with|longer|shorter|or|neither|nor)\b/i.test(
    query,
  ) ||
  /\b(?:unknown|missing|unset)\s+(?:expiry|expiration)\b/i.test(query) ||
  /\b(?:expiry|expiration)\s+(?:is\s+)?(?:unknown|missing|unset)\b/i.test(query)

const hasUnsupportedRoleOrVersionExclusion = (query: string): boolean => {
  const negative =
    "(?:not|non|except|excluding|exclude|without|aren['’]?t|isn['’]?t|don['’]?t|doesn['’]?t)"
  const connectors =
    '(?:(?:my|the|an?|those|ones|names|that|are|am|is|I|me|on|from|using|be|as)\\s+)*'
  const role =
    '(?:owner|owned|own|registrant|manager|managed|manage|controller|control|belong(?:ing)?)'
  const version = '(?:(?:ENS[\\s-]*)?v(?:ersion)?[\\s-]*[12])'
  return new RegExp(
    `\\b${negative}[\\s-]+${connectors}(?:${role}|${version})\\b`,
    'i',
  ).test(query)
}

const readRequestChoice = (
  answers: Record<string, unknown>,
  key: 'search_shape' | 'expiry_window',
  allowed: readonly string[],
): string | null | undefined => {
  // Older responses and supplied-response tests predate these questions.
  if (answers[key] === undefined) return undefined
  const answer = answers[key]
  if (
    !isRecord(answer) ||
    answer.type !== 'choice' ||
    typeof answer.choice !== 'string' ||
    !allowed.includes(answer.choice) ||
    typeof answer.confidence !== 'number' ||
    !Number.isFinite(answer.confidence) ||
    answer.confidence < 0 ||
    answer.confidence > 1
  )
    return null
  return answer.choice
}

const optionalRequestChoice = (
  answers: Record<string, unknown>,
  key: 'search_shape' | 'expiry_window',
  allowed: readonly string[],
  allowUncertainNone = false,
): string | null | undefined => {
  const choice = readRequestChoice(answers, key, allowed)
  if (choice === null || choice === undefined) return choice
  const answer = answers[key] as { confidence: number }
  return answer.confidence >=
    (allowUncertainNone && choice === 'none' ? 0 : 0.55)
    ? choice
    : null
}

const explicitOnlyFacet = (query: string): Facet | null => {
  const description = query
    .replace(
      /\b(?:show|list|find|give|me|please|my|all|the|names?|domains?|only)\b/gi,
      '',
    )
    .replace(/\s+/g, ' ')
    .replace(/[.!?]+$/, '')
    .trim()
  if (/^(?:(?:not|non|except|without)[\s-]+)?favou?rites?$/i.test(description))
    return 'favorite'
  if (/^(?:(?:not|non|except|without)[\s-]+)?primary$/i.test(description))
    return 'primary'
  if (
    /^(?:sort(?:ed)?|order(?:ed)?)(?:\s+by)?\s+(?:expiry|expiration|name|created)(?:\s+(?:ascending|descending))?$/i.test(
      description,
    )
  )
    return 'sort'
  return null
}

const resolveRoleVersion = (
  query: string,
  facets: ParsedFacets,
): Pick<ParsedFacets, 'role' | 'version'> | null => {
  const roleHint = explicitRole(query)
  const versionHint = explicitVersion(query)
  if (roleHint === 'invalid' || versionHint === 'invalid') return null
  if (roleHint && facets.role !== 'any' && facets.role !== roleHint) return null
  if (versionHint && facets.version !== 'any' && facets.version !== versionHint)
    return null
  return {
    role: roleHint ?? facets.role,
    version: versionHint ?? facets.version,
  }
}

const resolveFacetValues = (
  query: string,
  facets: ParsedFacets,
  withinDays: number | null,
): Pick<
  ParsedFacets,
  'expiry' | 'upgrade' | 'favorite' | 'primary' | 'sort'
> | null => {
  if (
    facets.upgrade !== 'any' &&
    !/\b(?:upgrad\w*|upgrde\w*|migrat\w*|migrte\w*|eligib\w*|eligble|ineligib\w*|ineligble)\b/i.test(
      query,
    ) &&
    !/\b(?:ready|able|can)\b.*\b(?:to|for|into)\s+(?:the\s+)?(?:(?:ens\s*)?v2|new\s+ens)\b/i.test(
      query,
    )
  )
    return null
  if (
    facets.primary !== 'any' &&
    !/\b(?:primary|primar\w*|priamry|main|reverse|identity|identitiy|represent\w*|identif\w*)\b/i.test(
      query,
    )
  )
    return null
  const hints = {
    expiry: explicitExpiry(query, withinDays),
    upgrade: explicitUpgrade(query),
    favorite: explicitFavorite(query),
    primary: explicitPrimary(query),
    sort: explicitSort(query),
  }
  for (const key of Object.keys(hints) as (keyof typeof hints)[]) {
    if (hints[key] && facets[key] !== 'any' && facets[key] !== hints[key])
      return null
  }
  return {
    expiry: hints.expiry ?? facets.expiry,
    upgrade: hints.upgrade ?? facets.upgrade,
    favorite: hints.favorite ?? facets.favorite,
    primary: hints.primary ?? facets.primary,
    sort: hints.sort ?? facets.sort,
  }
}

const resolveQueryFacets = (
  query: string,
  facets: ParsedFacets,
  answers: Record<string, unknown>,
  expiryWindowNotApplicable = false,
) => {
  if (
    hasExplicitUnsupportedConstraint(query) ||
    hasUnsupportedRoleOrVersionExclusion(query)
  )
    return null
  const request = resolveSearchRequest(
    query,
    answers,
    expiryWindowNotApplicable,
  )
  if (!request) return null
  const { shape, window, withinDays } = request
  const roleVersion = resolveRoleVersion(query, facets)
  if (!roleVersion) return null
  const resolved = resolveFacetValues(query, facets, withinDays)
  if (!resolved) return null
  if (window === 'soon' && resolved.expiry !== 'expiring') return null
  const allFacets = { ...resolved, ...roleVersion }
  const onlyFacet = shape === 'sort_only' ? 'sort' : explicitOnlyFacet(query)
  if (
    onlyFacet &&
    (Object.keys(allFacets) as Facet[]).some(
      (key) => key !== onlyFacet && allFacets[key] !== 'any',
    )
  )
    return null
  if (hasUnrepresentedCue(query, allFacets)) return null
  if (withinDays !== null && resolved.expiry !== 'expiring') return null
  if (resolved.upgrade !== 'any' && roleVersion.version === 'v2') return null
  return { ...allFacets, withinDays }
}

const resolveSearchRequest = (
  query: string,
  answers: Record<string, unknown>,
  expiryWindowNotApplicable = false,
) => {
  const shape = optionalRequestChoice(answers, 'search_shape', [
    'conjunction',
    'sort_only',
    'unsupported',
    'none',
    'alternatives',
    'bounded_range',
    'unknown_expiry',
  ])
  const isApproachingExpiry =
    readChoice(answers, 'expiry') === 'expiring' ||
    explicitExpiry(query, null) === 'expiring'
  const windowChoices = ['none', 'soon', 'positive_days', 'unsupported']
  // The AI caller may prove the full residual selection after extracting a
  // positive added duration, with every raw facet agreeing and no expiry clause.
  // In that case this metadata describes no selection filter. Its schema must
  // still be valid; malformed provider data never becomes an absent constraint.
  const interpretedWindow = expiryWindowNotApplicable
    ? readRequestChoice(answers, 'expiry_window', windowChoices)
    : optionalRequestChoice(
        answers,
        'expiry_window',
        windowChoices,
        !isApproachingExpiry,
      )
  const window =
    expiryWindowNotApplicable && interpretedWindow !== null
      ? 'none'
      : interpretedWindow
  if (
    shape === null ||
    shape === 'unsupported' ||
    shape === 'none' ||
    shape === 'alternatives' ||
    shape === 'bounded_range' ||
    shape === 'unknown_expiry' ||
    window === null ||
    window === 'unsupported'
  )
    return null
  const withinDays = parseExplicitDayCount(query, window === 'positive_days')
  if (withinDays === 'invalid') return null
  if (withinDays !== null && window !== undefined && window !== 'positive_days')
    return null
  return { shape, window, withinDays }
}

/** Validate all selection facets; an empty valid selection differs from failure. */
export const parseJevNameSelectionFacets = (
  answers: Record<string, unknown>,
  query: string,
  expiryWindowNotApplicable = false,
): SmartNameFilters | null => {
  const facets = readFacets(answers)
  if (!facets) return null
  const resolved = resolveQueryFacets(
    normalizeNegativeNameSelection(query),
    facets,
    answers,
    expiryWindowNotApplicable,
  )
  if (!resolved) return null
  const filters: SmartNameFilters = {
    ...(resolved.expiry !== 'any' && { expiry: resolved.expiry }),
    ...(resolved.withinDays !== null && { withinDays: resolved.withinDays }),
    ...(resolved.role !== 'any' && { role: resolved.role }),
    ...(resolved.version !== 'any' && { version: resolved.version }),
    ...(resolved.upgrade !== 'any' && { upgrade: resolved.upgrade }),
    ...(resolved.favorite !== 'any' && { favorite: resolved.favorite }),
    ...(resolved.primary !== 'any' && { primary: resolved.primary }),
    ...(resolved.sort !== 'any' && { sort: resolved.sort }),
  }
  return filters
}

export const parseJevNameSearchResponse = (
  response: unknown,
  query: string,
): SmartNameFilters | null => {
  const answers = readSupportedAnswers(response, query)
  if (!answers) return null
  const filters = parseJevNameSelectionFacets(answers, query)
  return filters && Object.keys(filters).length > 0 ? filters : null
}
