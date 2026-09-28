import { evmChainOptions } from '@/features/profile/components/dialogs/edit-profile/tabs/addresses/addressPickerRecords'
import { PROFILE_THEMES } from '@/features/profile/constants'
import {
  findProfileNetworks,
  getProfileNetwork,
  PROFILE_FIELD_DEFINITIONS,
} from '@/features/profile/service/profileFieldRegistry'
import {
  isUnquotedSocialStateAssignment,
  readCompleteSocialProfileRequest,
} from './completeSocialProfileRequest'
import { profileLinkDestinationWords } from './profileLinkIntent'

export type ProfileValueCandidate = {
  readonly id: string
  readonly value: string
  readonly start: number
  readonly end: number
}

const quotedPattern = /"[^"]*"|(?<![\p{L}\p{N}])'[^']*'|“[^”]*”|‘[^’]*’/gu
const targetPattern = /^(?:[\p{L}\p{N}_-]+\.)+[\p{L}\p{N}_-]+$/u
const profileCue =
  /\b(?:profile|bio|description|avatar|picture|photo|header|banner|display|full|location|timezone|language|phone|mailing|postal|twitter|twiter|twtter|x|telegram|telegarm|farcaster|discord|instagram|instgram|linkedin|mastodon|reddit|tiktok|twitch|bitcoin|solana|ethereum|email|e-mail|github|githb|gitub|githup|gihub|git\s+hub|address(?:es)?|theme|appearance|links?|website|contact|social)\b/i
const fieldWords =
  '(?:github|githb|gitub|githup|gihub|git\\s+hub|email|e-mail|avatar|bio|description|header|banner|display\\s+name|full\\s+name|location|time\\s*zone|language|phone|twitter|twiter|twtter|telegram|telegarm|farcaster|discord|instagram|instgram|linkedin|mastodon|reddit|tiktok|twitch|theme|appearance|links?|website|(?:ethereum|eth|evm|bitcoin|btc|solana|sol|base|optimism|arbitrum)\\s+address)'
const targetSuffix =
  /\s+(?:for|on|in|of|to)\s+(?:(?:my|the)\s+)?(?:profile\s+(?:(?:for|of)\s+)?)?(?:[\p{L}\p{N}_-]+\.)+[\p{L}\p{N}_-]+(?:['’]s)?(?:\s+profile)?(?:\s+(?:please|pls|plz))?[.!?]*$/iu
const fieldSuffix = new RegExp(
  `\\s+(?:for|on|in|as)\\s+(?:(?:my|the)\\s+)?${fieldWords}(?:\\s+(?:name|username|handle|profile|account|address|contact|record))?[.!?]*$`,
  'i',
)
const fieldDestination = new RegExp(
  `^(?:[\\p{L}\\p{N}_-]+\\.)+[\\p{L}\\p{N}_-]+(?:['’]s)?\\s+${fieldWords}[.!?]*$`,
  'iu',
)

const looksLikeProfileEdit = (query: string) =>
  profileCue.test(query) ||
  (/\b(?:set|edit|change|update|replace|swap|put|use)\b/i.test(query) &&
    !/\b(?:primary|main|reverse|default|notifications?|reminders?|alerts?|favou?rites?|renew|register|upgrade|migrate)\b/i.test(
      query,
    ))

const trimSpan = (query: string, start: number, end: number) => {
  const raw = query.slice(start, end)
  return {
    start: start + raw.length - raw.trimStart().length,
    end: end - (raw.length - raw.trimEnd().length),
  }
}

const trimValueContext = (query: string, start: number, end: number) => {
  let span = trimSpan(query, start, end)
  // Destination and field may occur in either order after an unquoted value.
  for (let pass = 0; pass < 2; pass += 1) {
    for (const pattern of [targetSuffix, fieldSuffix]) {
      const match = pattern.exec(query.slice(span.start, span.end))
      if (match) span = trimSpan(query, span.start, span.start + match.index)
    }
  }
  const polite = /\s+(?:please|pls|plz)[.!?]*$/i.exec(
    query.slice(span.start, span.end),
  )
  if (polite) span = trimSpan(query, span.start, span.start + polite.index)
  return span
}

type AddSpan = (start: number, end: number, value?: string) => void

/** Match only aliases from the existing destination catalog, never model text. */
export const normalizeProfileNetworkWords = (instruction: string): string =>
  instruction.replace(/\bpolgyon(?=\s+(?:address|record)\b)/gi, 'Polygon')

export const maskProfileNetworkReference = (
  instruction: string,
  coinType?: number,
): string => {
  const record = getProfileNetwork(coinType)
  if (!record) return instruction
  const aliases = [
    record.name,
    record.notation,
    evmChainOptions.find((option) => option.coinType === coinType)?.label,
  ]
    .filter((alias): alias is string => Boolean(alias && alias.length > 2))
    .sort((a, b) => b.length - a.length)
    .map((alias) => alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return normalizeProfileNetworkWords(instruction).replace(
    new RegExp(`\\b(?:${aliases.join('|')})\\b`, 'gi'),
    '[NETWORK]',
  )
}

const isEthNetworkDestination = (prefix: string, value: string): boolean => {
  if (
    !/\b(?:use|reuse|copy|enable|receive)\b.*\b(?:ethereum|eth)\s+(?:address|record)\b/i.test(
      prefix,
    )
  )
    return false
  const networks = findProfileNetworks(value)
  return (
    networks.length === 1 &&
    /^(?:(?:my|the|its)\s+)?\[NETWORK\](?:\s+(?:address|record))?[.!?]*$/i.test(
      maskProfileNetworkReference(value, networks[0]?.coinType),
    )
  )
}

const isCurrentEthSource = (prefix: string, value: string): boolean =>
  /\b(?:use|enable|receive)\b/i.test(prefix) &&
  findProfileNetworks(prefix).length === 1 &&
  /^(?:(?:my|the|its|current|saved|existing|same)\s+)*(?:ethereum|eth)\s+(?:address|record)[.!?]*$/i.test(
    value,
  ) &&
  !hasOtherProfileDestination(prefix)

const isSameProfileSource = (prefix: string, value: string): boolean =>
  /\b(?:use|reuse|copy|make|match)\b/i.test(prefix) &&
  /\b(?:ethereum|eth)\s+(?:address|record)\s*$/i.test(prefix) &&
  (/^(?:the\s+)?(?:same|this|that)\s+profile[.!?]*$/i.test(value) ||
    /^(?:[\p{L}\p{N}_-]+\.)+[\p{L}\p{N}_-]+\s+(?:to|into)\s+(?:another|a\s+different)\s+(?:network|chain)(?:\s+(?:address|record))?(?:\s+on\s+(?:the\s+)?(?:same|this|that)\s+profile)?[.!?]*$/iu.test(
      value,
    ))

const collectQuotedValues = (query: string, add: AddSpan) => {
  // Quoted ENS names are still targets unless they are in an assignment slot.
  for (const match of query.matchAll(quotedPattern)) {
    const value = match[0].slice(1, -1)
    const before = query.slice(0, match.index)
    if (
      targetPattern.test(value) &&
      !/\b(?:to|as|from|with|is|of|than|named|called|titled|links?)\s*$/i.test(
        before,
      )
    )
      continue
    if (looksLikeProfileEdit(query))
      add(match.index, match.index + match[0].length, value)
  }
}

const collectStructuredValues = (
  query: string,
  instruction: string,
  add: AddSpan,
) => {
  // Structured values are atomic, so punctuation within a URL is preserved.
  const structured =
    /https?:\/\/[^\s"“”‘’<>]+|\b[^\s@"'“”‘’]+@[^\s@"'“”‘’]+\.[^\s@"'“”‘’]+|\b0x[\da-fA-F]{40}\b|(?<!\S)@[a-z\d-]+\b/gi
  for (const match of instruction.matchAll(structured)) {
    let value = match[0]
    const opening = query[match.index - 1]
    if (opening === '(' && /\)[.!?]*$/.test(value))
      value = value.replace(/\)[.!?]*$/, '')
    if (opening === '[' && /\][.!?]*$/.test(value))
      value = value.replace(/\][.!?]*$/, '')
    add(match.index, match.index + value.length)
  }
}

const collectAssignedValues = (
  query: string,
  instruction: string,
  add: AddSpan,
) => {
  // The separators remain visible, allowing Jev to select old/new roles.
  const markers = [
    ...instruction.matchAll(
      /\b(?:to|as|from|with|named|called|titled|instead\s+of|rather\s+than|is(?:\s+now)?|should\s+be)\s+|,\s*not\s+|(?::|=)\s*/gi,
    ),
  ]
  for (const [index, marker] of markers.entries()) {
    const boundary = markers[index + 1]?.index ?? query.length
    if (
      /\bas\s+$/i.test(marker[0]) &&
      isUnquotedSocialStateAssignment(
        instruction.slice(0, marker.index),
        instruction.slice(marker.index + marker[0].length, boundary),
      )
    )
      continue
    const span = trimValueContext(
      query,
      marker.index + marker[0].length,
      boundary,
    )
    const value = query.slice(span.start, span.end)
    if (
      value.includes('~') ||
      /["“”‘’]/u.test(value) ||
      (targetPattern.test(value.replace(/[.!?]+$/, '')) &&
        !/\b(?:set|change|update|replace)\b/i.test(
          instruction.slice(0, marker.index),
        )) ||
      fieldDestination.test(value) ||
      /\b(?:and|then|also|but)\b/i.test(value) ||
      (fieldSuffix.test(` on ${value}`) &&
        !isExplicitFieldValue(instruction.slice(0, marker.index), marker[0])) ||
      (/\bwith\s+$/i.test(marker[0]) &&
        isCurrentEthSource(instruction.slice(0, marker.index), value)) ||
      (/\bfrom\s+$/i.test(marker[0]) &&
        isSameProfileSource(instruction.slice(0, marker.index), value)) ||
      (/\bas\s+$/i.test(marker[0]) &&
        new RegExp(`^${profileLinkDestinationWords}[.!?]*$`, 'i').test(value) &&
        !hasOtherProfileDestination(instruction.slice(0, marker.index))) ||
      (/\bas\s+$/i.test(marker[0]) &&
        isEthNetworkDestination(instruction.slice(0, marker.index), value) &&
        !hasOtherProfileDestination(instruction.slice(0, marker.index))) ||
      (/\bas\s+$/i.test(marker[0]) &&
        /^(?:(?:my|the)\s+)?(?:primary|main|reverse|default)(?:\s+name)?[.!?]*$/i.test(
          value,
        ))
    )
      continue
    add(span.start, span.end)
  }
}

const isExplicitFieldValue = (prefix: string, marker: string): boolean => {
  if (
    !/\b(?:to|with)\s+$/i.test(marker) ||
    !/\b(?:set|change|update|replace)\b/i.test(prefix)
  )
    return false
  const instruction = prefix.replace(/\S*[.@]\S*/g, '[NAME]')
  return PROFILE_FIELD_DEFINITIONS.some(({ pattern }) =>
    pattern.test(instruction),
  )
}

const hasOtherProfileDestination = (instruction: string): boolean => {
  const withoutNames = instruction.replace(
    /\S*@\S+|\S*\.[\p{L}\p{N}][\p{L}\p{N}-]*\S*/gu,
    '',
  )
  return PROFILE_FIELD_DEFINITIONS.some(
    ({ field, pattern }) =>
      field !== 'github' && field !== 'website' && pattern.test(withoutNames),
  )
}

const collectReorderedValues = (mask: () => string, add: AddSpan) => {
  const replacement = new RegExp(
    `\\breplace\\s+(?:(?:(?:[\\p{L}\\p{N}_-]+\\.)+[\\p{L}\\p{N}_-]+(?:['’]s)?\\s+)?(?:(?:my|the)\\s+)?${fieldWords}(?:\\s+(?:name|username|handle|contact|record))?\\s+)?(.+?)\\s+with\\s+`,
    'giu',
  )
  for (const match of mask().matchAll(replacement)) {
    const value = match[1]
    if (
      !value ||
      value.includes('~') ||
      targetPattern.test(value) ||
      fieldSuffix.test(` on ${value}`)
    )
      continue
    const start = match.index + match[0].lastIndexOf(value)
    add(start, start + value.length)
  }
  // Values can precede either their field or a comparison with the old value.
  // Masking only the text after “instead of” would expose the new value.
  const valueFirstPatterns = [
    new RegExp(
      `\\b(?:use|make|put)\\s+([^\\s]+)\\s+(?:(?:for|as|in)\\s+)?(?:my\\s+)?${fieldWords}\\b`,
      'gi',
    ),
    /\b(?:use|make|put)\s+([^\s]+)\s+(?:instead\s+of|rather\s+than)\s+/gi,
  ]
  for (const pattern of valueFirstPatterns)
    for (const match of mask().matchAll(pattern)) {
      const value = match[1]
      if (
        !value ||
        value.includes('~') ||
        targetPattern.test(value) ||
        /^(?:my|the|our|your|same|saved|existing|current)$/i.test(value)
      )
        continue
      const afterVerb = match[0].search(/\s/) + 1
      const start = match.index + match[0].indexOf(value, afterVerb)
      add(start, start + value.length)
    }
  for (const { label } of PROFILE_THEMES) {
    for (const match of mask().matchAll(new RegExp(`\\b${label}\\b`, 'gi')))
      add(match.index, match.index + match[0].length)
  }
}

/** Values stay local; Jev only sees numbered placeholders in their original roles. */
export const buildProfileValueContext = (query: string) => {
  const spans: { start: number; end: number; value: string }[] = []
  const add: AddSpan = (start, end, value) => {
    if (
      start >= end ||
      spans.some((span) => start < span.end && end > span.start)
    )
      return
    const exact = value ?? query.slice(start, end)
    if (exact.trim()) spans.push({ start, end, value: exact })
  }
  const mask = () =>
    spans.reduce(
      (text, { start, end }) =>
        `${text.slice(0, start)}${'~'.repeat(end - start)}${text.slice(end)}`,
      query,
    )
  collectQuotedValues(query, add)
  // Unquoted text is a candidate only in an identifiable profile context.
  // “Use name.eth as my reverse name” must keep its action words visible.
  // A trailing sentence period is not a domain. Keep role words such as
  // "primary." visible when deciding whether this is a profile mutation.
  const fieldContext = mask().replace(
    /\S*@\S+|\S*\.[\p{L}\p{N}][\p{L}\p{N}-]*\S*/gu,
    '',
  )
  if (
    looksLikeProfileEdit(fieldContext) &&
    !readCompleteSocialProfileRequest(mask())
  ) {
    collectStructuredValues(query, mask(), add)
    collectAssignedValues(query, mask(), add)
    collectReorderedValues(mask, add)
  }
  const candidates: readonly ProfileValueCandidate[] = spans
    .sort((left, right) => left.start - right.start)
    .map((span, index) => ({ ...span, id: `value_${index + 1}` }))
  const state = [...candidates]
    .reverse()
    .reduce(
      (text, { start, end, id }) =>
        `${text.slice(0, start)}[PROFILE_${id.toUpperCase()}]${text.slice(end)}`,
      query,
    )
  return { state, targetQuery: state, candidates }
}

export const buildJevProfileQuestions = (query: string) => {
  const { candidates, state } = buildProfileValueContext(query)
  const networks = findProfileNetworks(normalizeProfileNetworkWords(state))
  const valueChoices = Object.fromEntries(
    candidates.map(({ id }) => [
      id,
      `The exact locally stored text at [PROFILE_${id.toUpperCase()}].`,
    ]),
  )
  return {
    profile_field: {
      type: 'choice' as const,
      instructions:
        'For a profile edit, which ONE existing field is the destination? Understand ordinary wording and typos such as githb for GitHub. Ignore field words inside PROFILE_VALUE placeholders. Choose unknown when unspecified or ambiguous. Choose unsupported for unlisted fields or more than one destination field. For other actions choose none.',
      criteria: {
        ...Object.fromEntries(
          PROFILE_FIELD_DEFINITIONS.map(({ field, label }) => [
            field,
            `The existing ${label} profile record.`,
          ]),
        ),
        eth_address: 'Main Ethereum address record; not the primary ENS name.',
        address:
          'Address record on another cryptocurrency or a specific Ethereum-compatible chain. Bitcoin/BTC record, Solana/SOL record, and a named chain record refer to its address even when the word address is omitted.',
        link: 'A named custom link in Links, including adding, editing, renaming or removing one.',
        none: 'No field assignment: open a section or a non-profile action.',
        unknown: 'A profile edit with an unspecified or ambiguous field.',
        unsupported: 'Unsupported field or multiple destination field edits.',
      },
    },
    profile_network: {
      type: 'choice' as const,
      instructions:
        'Which specific network is explicitly requested for an address record? Choose only an existing listed destination. Other fields use none; missing or ambiguous network uses unknown. Never infer a network from a private value.',
      criteria: {
        ...Object.fromEntries(
          networks.map(({ coinType, name }) => [`coin_${coinType}`, name]),
        ),
        none: 'No network address action.',
        unknown: 'Network not specified or ambiguous.',
      },
    },
    profile_operation: {
      type: 'choice' as const,
      instructions:
        'What profile operation does the user request? A supplied old-to-new replacement is one edit. Never interpret a negated instruction as permission. Missing values can be requested later. For non-profile actions choose none.',
      criteria: {
        set: 'Set or add one supplied field value, or ask for its missing value.',
        replace:
          'Replace an explicitly supplied previous value with a new value.',
        remove: 'Remove or clear one existing field or named link.',
        feature:
          'Star one existing social account to feature it on the profile.',
        unfeature: 'Unstar one social account while preserving its record.',
        use_eth:
          'Enable one Ethereum-compatible chain using the already saved Ethereum address.',
        rename:
          'Rename or change the title, name, or label of one existing custom link while keeping its URL. Missing old or new titles can be clarified; this never changes the ENS name itself.',
        open: 'Open the editor without requesting a field value change.',
        unclear:
          'It is unclear whether or how the user wants to change a field.',
        unsupported: 'Negated edit, generated content, or multiple edits.',
        none: 'Not a profile action.',
      },
    },
    profile_value: {
      type: 'choice' as const,
      instructions:
        'Which PROFILE_VALUE placeholder is the NEW profile value the user wants to set? Each placeholder stands for exact text the user supplied, with its contents hidden for privacy; it is not a missing value. For "set avatar to [PROFILE_VALUE_1]" or "use [PROFILE_VALUE_1] for GitHub", choose value_1. You do not need the hidden contents to select its role. Never choose the previous value. Choose none only if no new literal was supplied, its role is ambiguous, this is not a profile action, or the user only wants to open the editor.',
      criteria: { ...valueChoices, none: 'No explicit unambiguous new value.' },
    },
    profile_previous_value: {
      type: 'choice' as const,
      instructions:
        'Which PROFILE_VALUE placeholder is the OLD/current value the user explicitly wants to replace? Each placeholder is supplied literal text with private contents hidden. In "from [PROFILE_VALUE_1] to [PROFILE_VALUE_2]", choose value_1; in "[PROFILE_VALUE_1] instead of [PROFILE_VALUE_2]", choose value_2. Select none unless an old-value condition is explicitly present. For non-profile actions choose none.',
      criteria: {
        ...valueChoices,
        none: 'No explicit previous-value condition.',
      },
    },
  }
}

type ProfileChoice =
  | { readonly status: 'missing' | 'invalid' }
  | { readonly status: 'uncertain' | 'confident'; readonly choice: string }

export const readProfileAnswer = (
  answers: Record<string, unknown> | undefined,
  key: string,
  choices: readonly string[],
): ProfileChoice => {
  const answer = answers?.[key]
  if (answer === undefined) return { status: 'missing' }
  if (typeof answer !== 'object' || answer === null || Array.isArray(answer))
    return { status: 'invalid' }
  const candidate = answer as Record<string, unknown>
  if (
    candidate.type !== 'choice' ||
    typeof candidate.choice !== 'string' ||
    !choices.includes(candidate.choice) ||
    typeof candidate.confidence !== 'number' ||
    !Number.isFinite(candidate.confidence) ||
    candidate.confidence < 0 ||
    candidate.confidence > 1
  )
    return { status: 'invalid' }
  return {
    status: candidate.confidence < 0.65 ? 'uncertain' : 'confident',
    choice: candidate.choice,
  }
}

export const readProfileChoice = (
  answers: Record<string, unknown> | undefined,
  key: string,
  choices: readonly string[],
): string | undefined | null => {
  const answer = readProfileAnswer(answers, key, choices)
  if (answer.status === 'missing') return undefined
  return answer.status === 'confident' ? answer.choice : null
}
