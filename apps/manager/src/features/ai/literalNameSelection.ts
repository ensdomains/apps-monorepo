import type { SmartNameFilters } from '@/features/dashboard/smartNameSearch'
import { getQuantityCandidates } from '@/utils/naturalLanguageQuantity'

export type LiteralNameSelection = {
  readonly filters: SmartNameFilters
  readonly scope:
    | { readonly kind: 'all' }
    | { readonly kind: 'reference' }
    | { readonly kind: 'exact'; readonly names: readonly string[] }
}

type Attribute = {
  readonly pattern: RegExp
  readonly filters: SmartNameFilters
}

const attribute = (phrase: string, filters: SmartNameFilters): Attribute => ({
  pattern: new RegExp(`^(?:${phrase})(?![\\p{L}\\p{N}_])`, 'iu'),
  filters,
})

// Each rule consumes a whole attribute clause. Long phrases precede their
// shorter forms; no unknown remainder is discarded as conversational filler.
const attributes: readonly Attribute[] = [
  attribute(
    '(?:sorted? |ordered? )?(?:by )?(?:soonest|earliest) expir(?:y|ation)(?: first)?',
    { sort: 'expiry-asc' },
  ),
  attribute(
    '(?:sorted? |ordered? )?(?:by )?latest expir(?:y|ation)(?: first)?',
    { sort: 'expiry-desc' },
  ),
  attribute('(?:sort(?:ed)?|order(?:ed)?) by expir(?:y|ation)(?: ascending)?', {
    sort: 'expiry-asc',
  }),
  attribute('(?:sort(?:ed)?|order(?:ed)?) by expir(?:y|ation) descending', {
    sort: 'expiry-desc',
  }),
  attribute('(?:sorted? |ordered? )?(?:by )?newest(?: names?)?(?: first)?', {
    sort: 'created-desc',
  }),
  attribute('(?:sorted? |ordered? )?(?:by )?oldest(?: names?)?(?: first)?', {
    sort: 'created-asc',
  }),
  attribute(
    '(?:sort(?:ed)?|order(?:ed)?) by (?:creation|created)(?: date| time)? descending',
    { sort: 'created-desc' },
  ),
  attribute(
    '(?:sort(?:ed)?|order(?:ed)?) by (?:creation|created)(?: date| time)?(?: ascending)?',
    { sort: 'created-asc' },
  ),
  attribute(
    '(?:sort(?:ed)? |order(?:ed)? )?(?:by )?(?:reverse alphabetical(?: order)?|alphabetically descending|z to a)',
    { sort: 'name-desc' },
  ),
  attribute(
    '(?:sort(?:ed)? |order(?:ed)? )?(?:by )?(?:alphabetical(?: order)?|alphabetically|a to z)',
    { sort: 'name-asc' },
  ),
  attribute('(?:sort(?:ed)?|order(?:ed)?) by names? descending', {
    sort: 'name-desc',
  }),
  attribute('(?:sort(?:ed)?|order(?:ed)?) by names?(?: ascending)?', {
    sort: 'name-asc',
  }),
  attribute(
    '(?:except|excluding|without|not) (?:my |the )?(?:favou?rites?|starred|bookmarked)(?: names?)?',
    { favorite: 'no' },
  ),
  attribute('non[- ]favou?rites?', { favorite: 'no' }),
  attribute(
    '(?:except|excluding|without|not) (?:my |the )?(?:primary|main|reverse)(?: names?)?',
    { primary: 'no' },
  ),
  attribute('non[- ]primary', { primary: 'no' }),
  attribute(
    '(?:not eligible|ineligible) (?:for|to) (?:upgrade|migrate|migration)',
    { upgrade: 'ineligible' },
  ),
  attribute('(?:eligible|ready) (?:for|to) (?:upgrade|migrate|migration)', {
    upgrade: 'eligible',
  }),
  attribute('(?:past|after|beyond|outside) (?:the )?grace(?: period)?', {
    expiry: 'past-grace',
  }),
  attribute('(?:in|inside|within) (?:the )?grace(?: period)?', {
    expiry: 'in-grace',
  }),
  attribute('grace(?: period)?(?: names?)?', { expiry: 'in-grace' }),
  attribute(
    '(?:non[- ]expiring|never expir(?:e|es)|do(?:es)? not expire|don[\u0027\u2019]t expire|doesn[\u0027\u2019]t expire|no expiry)',
    { expiry: 'non-expiring' },
  ),
  attribute('(?:not expired|active|unexpired)', { expiry: 'active' }),
  attribute('expired', { expiry: 'expired' }),
  attribute('with expir(?:y|ation)(?= (?:within|in) )', {
    expiry: 'expiring',
  }),
  attribute('(?:expir(?:ing|e|es)|due to expire|about to expire)(?: soon)?', {
    expiry: 'expiring',
  }),
  attribute('owned by me', { role: 'owner' }),
  attribute('(?:managed|controlled) by me', { role: 'manager' }),
  attribute('(?:i own|owned|owner|registrant)', { role: 'owner' }),
  attribute('(?:i manage|i control|managed|manager|controller)', {
    role: 'manager',
  }),
  attribute('(?:ens[- ]*)?v(?:ersion)?[- ]*1', { version: 'v1' }),
  attribute('(?:ens[- ]*)?v(?:ersion)?[- ]*2', { version: 'v2' }),
  attribute('(?:favou?rites?|starred|bookmarked)', { favorite: 'yes' }),
  attribute('(?:primary|main|reverse)(?: names?)?', { primary: 'yes' }),
]

type WindowSpan = { readonly length: number; readonly days: number }
const readExpiryWindow = (text: string): WindowSpan | null => {
  const prefix = /^(?:within|in) (?:the next |next )?/i.exec(text)
  if (!prefix) return null
  const rest = text.slice(prefix[0].length)
  const count = getQuantityCandidates(rest)[0]
  if (
    count?.index !== 0 ||
    !Number.isSafeInteger(count.value) ||
    count.value <= 0
  )
    return null
  const unit = /^ days?(?![\p{L}\p{N}_])/iu.exec(rest.slice(count.text.length))
  if (!unit) return null
  return {
    length: prefix[0].length + count.text.length + unit[0].length,
    days: count.value,
  }
}

const combineFilters = (
  current: SmartNameFilters,
  added: SmartNameFilters,
): SmartNameFilters | null => {
  for (const key of Object.keys(added) as (keyof SmartNameFilters)[]) {
    if (current[key] !== undefined && current[key] !== added[key]) return null
  }
  return { ...current, ...added }
}

type SelectionToken = {
  readonly length: number
  readonly kind:
    | 'attribute'
    | 'exact'
    | 'reference'
    | 'subject'
    | 'modifier'
    | 'relation'
    | 'location'
    | 'connector'
  readonly filters?: SmartNameFilters
}
const structure: readonly {
  readonly pattern: RegExp
  readonly kind: SelectionToken['kind']
}[] = [
  { pattern: /^\[ENS_NAME(?:_[1-9]\d*)?\]/i, kind: 'exact' },
  {
    pattern:
      /^(?:those|these|selected)(?: selected| matching)?(?: names?| domains?)?(?![\p{L}\p{N}_])/iu,
    kind: 'reference',
  },
  {
    pattern:
      /^(?:(?:all(?: of)?|every|my|the|our) )*(?:names?|nmaes|domains?)(?![\p{L}\p{N}_])/iu,
    kind: 'subject',
  },
  {
    pattern: /^(?:(?:that|which) (?:are )?|are |only when (?:they are )?)/i,
    kind: 'relation',
  },
  { pattern: /^(?:all(?: of)? |my |the |our |only )/i, kind: 'modifier' },
  {
    pattern: /^in (?:my|the|this) (?:connected )?wallet(?![\p{L}\p{N}_])/iu,
    kind: 'location',
  },
  { pattern: /^(?:, ?(?:and )?|and |& )/i, kind: 'connector' },
]
const readSelectionToken = (
  text: string,
  filters: SmartNameFilters,
): SelectionToken | null => {
  const window = readExpiryWindow(text)
  if (window && filters.expiry === 'expiring')
    return {
      length: window.length,
      kind: 'attribute',
      filters: { withinDays: window.days },
    }
  const matched = attributes
    .map((item) => ({ item, match: item.pattern.exec(text) }))
    .filter((entry) => entry.match !== null)
    .sort((a, b) => (b.match?.[0].length ?? 0) - (a.match?.[0].length ?? 0))[0]
  if (matched?.match)
    return {
      length: matched.match[0].length,
      kind: 'attribute',
      filters: matched.item.filters,
    }
  for (const rule of structure) {
    const match = rule.pattern.exec(text)
    if (match) return { length: match[0].length, kind: rule.kind }
  }
  return null
}
type ProofState = {
  readonly filters: SmartNameFilters
  readonly reference: boolean
  readonly subject: boolean
  readonly count: number
  readonly last: SelectionToken['kind'] | 'start'
}
const advanceProof = (
  state: ProofState,
  token: SelectionToken,
): ProofState | null => {
  const contextual = ['relation', 'location', 'connector'].includes(token.kind)
  if (contextual && !state.subject && Object.keys(state.filters).length === 0)
    return null
  if (
    token.kind === 'connector' &&
    ['connector', 'relation', 'modifier'].includes(state.last)
  )
    return null
  const filters = combineFilters(state.filters, token.filters ?? {})
  if (!filters) return null
  return {
    filters,
    reference: state.reference || token.kind === 'reference',
    subject:
      state.subject || ['subject', 'exact', 'reference'].includes(token.kind),
    count: state.count + Number(token.kind === 'exact'),
    last: token.kind,
  }
}
const finishProof = (
  state: ProofState,
  exactNames: readonly string[],
): LiteralNameSelection | null => {
  if (
    ['start', 'connector', 'modifier', 'relation'].includes(state.last) ||
    (!state.subject && Object.keys(state.filters).length === 0) ||
    state.count !== exactNames.length ||
    (state.reference && state.count > 0) ||
    (state.filters.upgrade && state.filters.version === 'v2')
  )
    return null
  const scope: LiteralNameSelection['scope'] =
    state.count > 0
      ? { kind: 'exact', names: exactNames }
      : state.reference
        ? { kind: 'reference' }
        : { kind: 'all' }
  return { filters: state.filters, scope }
}

/**
 * A narrow proof for resolving generic uncertainty, not a replacement for Jev.
 * The caller redacts exact names and removes a validated added-duration span.
 * Unknown wording returns null so the ordinary semantic parser keeps its gates.
 */
export const proveLiteralNameSelection = (
  redactedQuery: string,
  exactNames: readonly string[] = [],
  addedDurationRemoved = false,
): LiteralNameSelection | null => {
  let remaining = redactedQuery
    .trim()
    .replace(/[.!?]+$/, '')
    .replace(/\s+/g, ' ')
    .replace(
      /^(?:please )?(?:show|find|list|display|give|renew|renwe|extend|extnd)(?: me)? /i,
      '',
    )
    .replace(/^which (?:of )?/i, '')
  // These wrappers are meaningful only after a validated renewal amount was
  // extracted: "Add three years to ..." / "Increase the lifetime of ... by ...".
  if (addedDurationRemoved)
    remaining = remaining.replace(
      /^(?:to |increase (?:the )?lifetime of (?:the )?)/i,
      '',
    )
  let state: ProofState = {
    filters: {},
    reference: false,
    subject: false,
    count: 0,
    last: 'start',
  }
  while (remaining) {
    const token = readSelectionToken(remaining, state.filters)
    if (!token) return null
    const next = advanceProof(state, token)
    if (!next) return null
    state = next
    remaining = remaining.slice(token.length).trimStart()
  }
  return finishProof(state, exactNames)
}

const isMatchingChoice = (answer: unknown, expected: string): boolean => {
  if (!answer || typeof answer !== 'object' || Array.isArray(answer))
    return false
  const value = answer as Record<string, unknown>
  return (
    value.type === 'choice' &&
    value.choice === expected &&
    typeof value.confidence === 'number' &&
    Number.isFinite(value.confidence) &&
    value.confidence >= 0 &&
    value.confidence <= 1
  )
}

/** Compare raw choices, never local overrides of a contradictory model facet. */
export const hasLiteralNameSelectionAgreement = (
  redactedQuery: string,
  answers: Record<string, unknown>,
  exactNames: readonly string[] = [],
  addedDurationRemoved = false,
): boolean => {
  const proof = proveLiteralNameSelection(
    redactedQuery,
    exactNames,
    addedDurationRemoved,
  )
  if (!proof) return false
  const facets = [
    'expiry',
    'role',
    'version',
    'upgrade',
    'favorite',
    'primary',
    'sort',
  ] as const
  return (
    facets.every((facet) =>
      isMatchingChoice(answers[facet], proof.filters[facet] ?? 'any'),
    ) &&
    isMatchingChoice(answers.search_shape, 'conjunction') &&
    (addedDurationRemoved &&
    proof.filters.expiry !== 'expiring' &&
    proof.filters.withinDays === undefined
      ? ['none', 'soon', 'positive_days', 'unsupported'].some((value) =>
          isMatchingChoice(answers.expiry_window, value),
        )
      : isMatchingChoice(
          answers.expiry_window,
          proof.filters.withinDays === undefined
            ? proof.filters.expiry === 'expiring'
              ? 'soon'
              : 'none'
            : 'positive_days',
        ))
  )
}
