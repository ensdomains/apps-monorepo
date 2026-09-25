import type { SmartNameFilters } from '../smartNameSearch'

const choices = {
  expiry: {
    any: 'No expiry condition requested.',
    expiring:
      'A name whose expiry is approaching, including a stated number of days.',
    active: 'Not yet expired, with a known future expiry.',
    expired: 'Already expired, whether in or past its grace period.',
    'in-grace': 'Expired but still inside the registrar grace period.',
    'past-grace': 'The grace period has ended.',
    'non-expiring': 'Explicitly has no expiry date.',
  },
  role: {
    any: 'No owner or manager role requested.',
    owner: 'The connected wallet is an owner.',
    manager: 'The connected wallet is a manager.',
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
    any: 'No primary name status requested.',
    yes: 'The connected wallet primary name.',
    no: 'Names other than the primary name.',
  },
  sort: {
    any: 'No ordering requested.',
    'name-asc': 'Alphabetical name order.',
    'name-desc': 'Reverse alphabetical name order.',
    'created-asc': 'Oldest names first.',
    'created-desc': 'Newest names first.',
    'expiry-asc': 'Soonest expiry first.',
    'expiry-desc': 'Latest expiry first.',
  },
} as const

type Facet = keyof typeof choices

const facetInstructions: Record<Facet, string> = {
  expiry:
    'Which expiry condition does the user explicitly request? Choose any if none.',
  role: 'Which wallet role does the user explicitly request? Choose any if none.',
  version:
    'Which ENS version does the user explicitly request? Choose any if none.',
  upgrade:
    'Which upgrade eligibility does the user explicitly request? Choose any if none.',
  favorite:
    'Which favorite status does the user explicitly request? Choose any if none.',
  primary:
    'Which primary name status does the user explicitly request? Choose any if none.',
  sort: 'Which result order does the user explicitly request? Choose any if none.',
}

export const JEV_NAME_SEARCH_QUESTION_SET_VERSION = 'v0'
export const JEV_NAME_SEARCH_POLICY_VERSION = 'v0'

export const looksLikeJevNameSearchRequest = (query: string): boolean =>
  /\s/.test(query) ||
  /\b(expir\w*|grace|owner|manager|upgrade\w*|eligible|ineligible|favou?rite\w*|primary|oldest|newest|alphabetic\w*|sort\w*|order\w*|(?:ens)?v[12])\b/i.test(
    query,
  )

export const buildJevNameSearchRequest = (query: string) => ({
  model: 'jev-latest',
  state: query,
  questions: {
    fully_supported: {
      type: 'noul',
      instructions:
        'Can every part of this request be satisfied by combining expiry or grace state, owner or manager role, ENS version, upgrade eligibility, favorite status, primary name status, and name/created/expiry order? Approaching expiry may include any positive integer day count. For example, names expiring soon is fully supported. Answer no for name meaning, arbitrary name fragments combined with filters, date ranges, OR conditions, or other unsupported constraints.',
      criteria: {
        true: 'Every requested constraint has a matching dashboard filter or sort.',
        false: 'At least one requested constraint cannot be represented.',
      },
    },
    unsupported_requirement: {
      type: 'noul',
      instructions:
        'Does this request include ANY requirement outside these dashboard properties: expiry or grace state, owner or manager role, ENSv1 or ENSv2, upgrade eligibility, favorite status, primary name, and name/created/expiry sort? Ignore generic words such as show, my, names, only, are, that. A request about the meaning or topic of a name, text contained in a name, arbitrary dates, OR, or unrelated properties has an unsupported requirement. Examples: favorites = no; names I manage = no; primary name = no; sort by expiry = no; names about surfing expiring soon = yes.',
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
          instructions: facetInstructions[facet],
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
  if (!(answer.choice in choices[key])) return null
  return answer.choice as keyof (typeof choices)[K]
}

const readFacetChoice = <K extends Facet>(
  answers: Record<string, unknown>,
  key: K,
): keyof (typeof choices)[K] | null => {
  const choice = readChoice(answers, key)
  if (!choice) return null
  const confidence = (answers[key] as { confidence: number }).confidence
  return choice !== 'any' && confidence < 0.35 ? 'any' : choice
}

export const parseExplicitDayCount = (
  query: string,
): number | null | 'invalid' => {
  const dayMentions = [...query.matchAll(/\b\d+\s+days?\b/gi)]
  if (dayMentions.length === 0) return null
  if (dayMentions.length !== 1) return 'invalid'
  const match = query.match(
    /\b(?:within|next|in(?: the next)?)\s+(\d+)\s+days?\b/i,
  )
  if (!match) return 'invalid'
  const days = Number(match[1])
  return Number.isSafeInteger(days) && days > 0 ? days : 'invalid'
}

const explicitRole = (
  query: string,
): 'owner' | 'manager' | null | 'invalid' => {
  const owner = /\b(owner|owned|own)\b/i.test(query)
  const manager = /\b(manager|manage|managed)\b/i.test(query)
  if (owner && manager) return 'invalid'
  return owner ? 'owner' : manager ? 'manager' : null
}

const explicitVersion = (query: string): 'v1' | 'v2' | null | 'invalid' => {
  const v1 = /\b(?:ens)?v1\b/i.test(query)
  const v2 = /\b(?:ens)?v2\b/i.test(query)
  if (v1 && v2) return 'invalid'
  return v1 ? 'v1' : v2 ? 'v2' : null
}

const hasSortCue = (query: string): boolean =>
  /\b(sort\w*|order\w*|first|last|ascending|descending|alphabetic\w*|newest|oldest|soonest|latest)\b/i.test(
    query,
  )

const explicitFavorite = (query: string): 'yes' | 'no' | null => {
  if (!/\bfavou?rites?\b/i.test(query)) return null
  return /\b(?:not|non|without|exclude|excluding)[\s-]+(?:my\s+)?favou?rites?\b/i.test(
    query,
  )
    ? 'no'
    : 'yes'
}

const explicitPrimary = (query: string): 'yes' | 'no' | null => {
  if (!/\bprimary\b/i.test(query)) return null
  return /\b(?:not|non|without|exclude|excluding)[\s-]+(?:my\s+)?primary\b/i.test(
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
  if (/\b(?:past|after|out of)\s+(?:the\s+)?grace\b/i.test(query))
    return 'past-grace'
  if (/\bgrace(?:\s+period)?\s+(?:has\s+)?(?:ended|over)\b/i.test(query))
    return 'past-grace'
  if (/\bgrace\b/i.test(query)) return 'in-grace'
  if (/\b(?:non-expiring|never expires?|no expiry)\b/i.test(query))
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

export type JevNameSearchRejectionReason =
  | 'invalid_response'
  | 'invalid_support_answer'
  | 'support_gate_rejected'
  | 'invalid_choice_answer'
  | 'deterministic_policy_rejected'
  | 'empty_filters'

type SupportedAnswersResult =
  | { readonly status: 'ok'; readonly answers: Record<string, unknown> }
  | {
      readonly status: 'rejected'
      readonly reason: JevNameSearchRejectionReason
    }

const readSupportedAnswers = (response: unknown): SupportedAnswersResult => {
  if (!isRecord(response) || !isRecord(response.answers)) {
    return { status: 'rejected', reason: 'invalid_response' }
  }
  const answers = response.answers
  const support = answers.fully_supported
  const unsupported = answers.unsupported_requirement
  if (
    !isRecord(support) ||
    support.type !== 'noul' ||
    typeof support.noul !== 'number' ||
    !Number.isFinite(support.noul) ||
    support.noul < 0 ||
    support.noul > 1 ||
    !isRecord(unsupported) ||
    unsupported.type !== 'noul' ||
    typeof unsupported.noul !== 'number' ||
    !Number.isFinite(unsupported.noul) ||
    unsupported.noul < 0 ||
    unsupported.noul > 1
  ) {
    return { status: 'rejected', reason: 'invalid_support_answer' }
  }
  if (support.noul < 0.3 || unsupported.noul >= 0.85) {
    return { status: 'rejected', reason: 'support_gate_rejected' }
  }
  return { status: 'ok', answers }
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

type ParsedFacets = NonNullable<ReturnType<typeof readFacets>>

const hasUnrepresentedCue = (query: string, facets: ParsedFacets): boolean =>
  (facets.expiry === 'any' && hasExpiryStatusCue(query)) ||
  (facets.upgrade === 'any' && /\bupgrad\w*\b/i.test(query)) ||
  (facets.sort === 'any' && hasSortCue(query))

const hasExplicitUnsupportedConstraint = (query: string): boolean =>
  /\b(?:names?|domains?)\s+about\b(?!\s+to\s+expir)/i.test(query) ||
  /\b(?:meaning|rhym\w*|contain\w*|characters?|letters?|price|cost|starts? with|ends? with|longer|shorter|or)\b/i.test(
    query,
  )

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
    role: roleHint ?? 'any',
    version: versionHint ?? 'any',
  }
}

const resolveFacetValues = (
  query: string,
  facets: ParsedFacets,
  withinDays: number | null,
): Pick<
  ParsedFacets,
  'expiry' | 'upgrade' | 'favorite' | 'primary' | 'sort'
> => ({
  expiry:
    explicitExpiry(query, withinDays) ??
    (hasExpiryStatusCue(query) ? facets.expiry : 'any'),
  upgrade:
    explicitUpgrade(query) ??
    (/\bupgrad\w*\b/i.test(query) ? facets.upgrade : 'any'),
  favorite:
    explicitFavorite(query) ??
    (/\b(?:starred|bookmarked)\b/i.test(query) ? facets.favorite : 'any'),
  primary:
    explicitPrimary(query) ??
    (/\b(?:main|reverse)\s+name\b/i.test(query) ? facets.primary : 'any'),
  sort: explicitSort(query) ?? (hasSortCue(query) ? facets.sort : 'any'),
})

const resolveQueryFacets = (query: string, facets: ParsedFacets) => {
  if (hasExplicitUnsupportedConstraint(query)) return null
  const withinDays = parseExplicitDayCount(query)
  if (withinDays === 'invalid') return null
  const roleVersion = resolveRoleVersion(query, facets)
  if (!roleVersion) return null
  const resolved = resolveFacetValues(query, facets, withinDays)
  if (
    hasUnrepresentedCue(query, {
      ...facets,
      ...resolved,
    })
  )
    return null
  if (withinDays !== null && resolved.expiry !== 'expiring') return null
  if (resolved.upgrade !== 'any' && roleVersion.version === 'v2') return null
  return {
    ...facets,
    withinDays,
    ...resolved,
    ...roleVersion,
  }
}

export type JevNameSearchParseResult =
  | { readonly status: 'ok'; readonly filters: SmartNameFilters }
  | {
      readonly status: 'rejected'
      readonly reason: JevNameSearchRejectionReason
    }

export const parseJevNameSearchResponseWithReason = (
  response: unknown,
  query: string,
): JevNameSearchParseResult => {
  const supported = readSupportedAnswers(response)
  if (supported.status === 'rejected') return supported
  const facets = readFacets(supported.answers)
  if (!facets) return { status: 'rejected', reason: 'invalid_choice_answer' }
  const resolved = resolveQueryFacets(query, facets)
  if (!resolved) {
    return { status: 'rejected', reason: 'deterministic_policy_rejected' }
  }
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
  return Object.keys(filters).length > 0
    ? { status: 'ok', filters }
    : { status: 'rejected', reason: 'empty_filters' }
}

export const parseJevNameSearchResponse = (
  response: unknown,
  query: string,
): SmartNameFilters | null => {
  const result = parseJevNameSearchResponseWithReason(response, query)
  return result.status === 'ok' ? result.filters : null
}
