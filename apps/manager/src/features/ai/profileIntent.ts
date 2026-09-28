import { PROFILE_THEMES } from '@/features/profile/constants'
import {
  findProfileNetworks,
  PROFILE_FIELD_DEFINITIONS,
  type ProfileField,
  type ProfileOperation,
} from '@/features/profile/service/profileFieldRegistry'
import {
  type CompleteSocialProfileRequest,
  hasSocialMarkerOperation,
  hasUnquotedSocialStateRole,
  readCompleteSocialProfileRequest,
} from './completeSocialProfileRequest'
import type { ProfileActionDetails } from './profileAiPreparation'
import {
  isProfileLinkRename,
  parseNamedProfileLink,
  profileLinkDestinationWords,
} from './profileLinkIntent'
import {
  buildProfileValueContext,
  maskProfileNetworkReference,
  normalizeProfileNetworkWords,
  type ProfileValueCandidate,
  readProfileAnswer,
} from './profileValueContext'

export {
  buildJevProfileQuestions,
  buildProfileValueContext,
} from './profileValueContext'

type ProfileAction = {
  readonly intent: 'edit_profile'
  readonly name?: string
} & ProfileActionDetails

const fieldPatterns: readonly {
  readonly field: ProfileField
  readonly pattern: RegExp
  readonly section: ProfileAction['section']
}[] = [
  ...PROFILE_FIELD_DEFINITIONS,
  {
    field: 'eth_address',
    pattern: /\b(?:eth|ethereum|evm)\s+(?:address|record)\b/i,
    section: 'addresses',
  },
  {
    field: 'address',
    pattern:
      /\b(?:bitcoin|btc|solana|sol|base|optimism|arbitrum|polygon|bnb|bsc|zksync|zora|scroll|linea|celo|gnosis|avalanche|litecoin|dogecoin)\s+(?:address|record)\b|\b(?:crypto|network|chain)\s+address\b/i,
    section: 'addresses',
  },
]

const quotedValuePattern = /"[^"]*"|(?<![\p{L}\p{N}])'[^']*'|“[^”]*”|‘[^’]*’/gu

const maskQuotedValues = (value: string): string =>
  value.replace(quotedValuePattern, (match) => '~'.repeat(match.length))

const escapePattern = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const stripOuterQuotes = (value: string): string => {
  const trimmed = value.trim()
  const quoted = trimmed.match(
    /^(?:"([\s\S]*)"|'([\s\S]*)'|“([\s\S]*)”|‘([\s\S]*)’)[.!?]*$/u,
  )
  return quoted
    ? (quoted[1] ?? quoted[2] ?? quoted[3] ?? quoted[4] ?? '').trim()
    : trimmed
}

type Assignment = {
  readonly value?: string
  readonly expectedValue?: string
}

// Context after an unquoted value identifies its destination, not its contents.
// Quoted descriptions and URLs keep their exact text and punctuation.
const stripTargetContext = (
  value: string,
  name?: string,
  field?: ProfileField,
): string => {
  const target = name
    ? `(?:${escapePattern(name)}(?:['’]s)?(?:\\s+profile)?|(?:(?:my|the)\\s+)?profile\\s+(?:for\\s+)?${escapePattern(name)})`
    : undefined
  const suffixes = [
    ...(target
      ? [new RegExp(`\\s+(?:for|on|in|of)\\s+${target}[.!?]*$`, 'i')]
      : []),
    ...(field === 'github'
      ? [
          /\s+(?:on|in|for)\s+(?:(?:my|the)\s+)?github(?:\s+(?:name|username|handle|profile|account|contact|record))?[.!?]*$/i,
        ]
      : []),
  ]
  return suffixes.reduce(
    (current) =>
      suffixes.reduce((text, suffix) => {
        const match = suffix.exec(maskQuotedValues(text))
        return match ? text.slice(0, match.index).trim() : text
      }, current),
    value.trim(),
  )
}

const cleanAssignmentValue = (
  value: string | undefined,
  name?: string,
  field?: ProfileField,
): string | undefined => {
  if (!value) return undefined
  const scoped = stripTargetContext(value, name, field)
  // A missing-value request can end with its target and ordinary politeness.
  // This exact target comparison must not trim words from an actual value.
  if (
    name &&
    new RegExp(
      `^${escapePattern(name)}\\s+(?:please|pls|plz)[.!?]*$`,
      'i',
    ).test(scoped)
  )
    return undefined
  const supplied =
    ['avatar', 'header', 'website'].includes(field ?? '') &&
    httpUrlPattern.test(scoped)
      ? extractHttpUrl(scoped)
      : stripOuterQuotes(scoped)
  const cleaned =
    field === 'github' && supplied && !httpUrlPattern.test(supplied)
      ? supplied.replace(/[.,!?;:]+$/u, '')
      : supplied
  return cleaned &&
    cleaned.replace(/[.!?]+$/, '').toLowerCase() !== name?.toLowerCase()
    ? cleaned
    : undefined
}

const splitOutsideQuotes = (
  value: string,
  pattern: RegExp,
): readonly string[] => {
  const matches = [...maskQuotedValues(value).matchAll(pattern)]
  if (matches.length === 0) return [value]
  const match = matches[0]
  if (matches.length !== 1 || !match) return []
  return [
    value.slice(0, match.index),
    value.slice(match.index + match[0].length),
  ]
}

const assignmentFromParts = (
  value: string | undefined,
  expectedValue: string | undefined,
  name?: string,
  field?: ProfileField,
): Assignment | null => {
  const cleanedValue = cleanAssignmentValue(value, name, field)
  const cleanedExpectedValue = cleanAssignmentValue(expectedValue, name, field)
  if (expectedValue !== undefined && (!cleanedExpectedValue || !cleanedValue))
    return null
  return {
    ...(cleanedValue && { value: cleanedValue }),
    ...(cleanedExpectedValue && { expectedValue: cleanedExpectedValue }),
  }
}

const stripSectionDestination = (query: string, name?: string): string => {
  const reordered = name
    ? new RegExp(
        `\\b(?:to|as)\\s+${escapePattern(name)}(?:['’]s)?\\s+(?:avatar|header|banner|links?|profile|contact|addresses|appearance)[.!?]*$`,
        'i',
      ).exec(maskQuotedValues(query))
    : null
  if (reordered) return query.slice(0, reordered.index).trim()
  const sectionDestination = name
    ? new RegExp(
        `\\bto\\s+(?:(?:my|the)\\s+)?(?:links?|profile|contact|addresses|appearance)(?:\\s+section)?\\s+(?:of|on|for)\\s+${escapePattern(name)}[.!?]*$`,
        'i',
      ).exec(maskQuotedValues(query))
    : null
  return sectionDestination
    ? query.slice(0, sectionDestination.index).trim()
    : query
}

const stripReplacementFieldPrefix = (
  value: string | undefined,
  field?: ProfileField,
  name?: string,
) => {
  if (!value) return value
  const scoped = value
    .replace(
      name ? new RegExp(`^${escapePattern(name)}(?:['’]s)?\\s+`, 'i') : /$^/,
      '',
    )
    .replace(/^(?:my|the)\s+/i, '')
  const match = fieldPatterns
    .find((entry) => entry.field === field)
    ?.pattern.exec(scoped)
  if (match?.index !== 0) return value
  return scoped
    .slice(match[0].length)
    .replace(/^\s*(?:(?:name|username|handle|account|contact|record)\s+)?/i, '')
}

const remainingReplacementText = (
  value: string,
  name?: string,
  field?: ProfileField,
) => {
  return maskQuotedValues(value)
    .replace(name ? new RegExp(escapePattern(name), 'gi') : /$^/, '')
    .replace(
      fieldPatterns.find((entry) => entry.field === field)?.pattern ?? /$^/,
      '',
    )
    .replace(
      /\b(?:my|the|profile|contact|record|account|username|handle)\b/gi,
      '',
    )
    .trim()
}

const parseReplacement = (
  value: string,
  name?: string,
  field?: ProfileField,
): Assignment | null => {
  const parts = splitOutsideQuotes(value, /\s+with\s+/gi)
  if (parts.length !== 2) {
    const remaining = remainingReplacementText(value, name, field)
    return remaining === '' ? {} : null
  }
  const oldValue = stripReplacementFieldPrefix(parts[0], field, name)
  return assignmentFromParts(parts[1], oldValue || undefined, name, field)
}

const parseAssignment = (
  query: string,
  name?: string,
  field?: ProfileField,
): Assignment | null => {
  // “As a link” identifies the destination; its words are never the URL value.
  // Keep it literal inside an explicitly selected record such as description.
  const destinationQuery = field
    ? query
    : query.replace(
        new RegExp(`\\bas\\s+${profileLinkDestinationWords}\\b`, 'gi'),
        '',
      )
  const valueQuery = stripSectionDestination(destinationQuery, name)
  const withoutDestination = name
    ? valueQuery.replace(
        new RegExp(`\\bto\\s+${escapePattern(name)}(?=\\s+(?:as|to)\\b)`, 'i'),
        '',
      )
    : valueQuery
  const scoped = stripTargetContext(withoutDestination, name, field)
  const instruction = maskQuotedValues(scoped).replace(
    /https?:\/\/\S+/gi,
    (match) => '~'.repeat(match.length),
  )
  const assignment = /\b(?:to|as)\s+/i.exec(instruction)
  const replacement = /\breplace\s+/i.exec(instruction)
  if (replacement && (!assignment || replacement.index < assignment.index)) {
    return parseReplacement(
      scoped.slice(replacement.index + replacement[0].length),
      name,
      field,
    )
  }
  const from = /\bfrom\s+/i.exec(instruction)
  if (from && (!assignment || from.index < assignment.index)) {
    const parts = splitOutsideQuotes(
      scoped.slice(from.index + from[0].length),
      /\s+to\s+/gi,
    )
    if (parts.length !== 2) return null
    return assignmentFromParts(parts[1], parts[0], name, field)
  }
  if (!assignment) return {}
  const value = scoped.slice(assignment.index + assignment[0].length)
  const parts = splitOutsideQuotes(
    value,
    /(?:\s+(?:instead\s+of|rather\s+than)\s+|,\s*not\s+)/gi,
  )
  if (parts.length === 0) return null
  return assignmentFromParts(parts[0], parts[1], name, field)
}

const httpUrlPattern = /https?:\/\/\S+/i

const extractHttpUrl = (query: string): string | undefined => {
  const match = httpUrlPattern.exec(query)
  if (!match) return undefined

  const opening = query[match.index - 1]
  const closingByOpening: Record<string, string> = {
    '"': '"',
    "'": "'",
    '“': '”',
    '‘': '’',
    '(': ')',
    '[': ']',
    '<': '>',
  }
  const closing = opening ? closingByOpening[opening] : undefined
  if (closing) {
    const withoutSentencePunctuation = match[0].replace(/[.,!?;:]+$/u, '')
    if (withoutSentencePunctuation.endsWith(closing)) {
      return withoutSentencePunctuation.slice(0, -closing.length)
    }
  }

  // A final comma or period can also be part of a URL path. Ask for the URL
  // explicitly when an unwrapped ending is ambiguous instead of changing it.
  return /[.,!?;:]$/u.test(match[0]) ? undefined : match[0]
}

const matchingThemes = (query: string) =>
  PROFILE_THEMES.filter(({ label }) =>
    new RegExp(`\\b${label}\\b`, 'i').test(query),
  )

const getFieldValue = (
  field: ProfileField,
  query: string,
  assignment?: string,
): string | undefined => {
  switch (field) {
    case 'description':
      return assignment
    case 'github':
      return (
        assignment ??
        extractHttpUrl(query) ??
        query.match(
          /\bgithub(?:\s+(?:name|username|handle))?\s+(@[a-z\d-]+)\b/i,
        )?.[1]
      )
    case 'avatar':
    case 'header':
    case 'website':
      return assignment ?? extractHttpUrl(query)
    case 'email':
      return assignment ?? query.match(/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/)?.[0]
    case 'eth_address':
      return assignment ?? query.match(/\b0x[\da-fA-F]+\b/)?.[0]
    case 'theme': {
      if (assignment) {
        const targetTheme = assignment.replace(/[.,!?;:]+$/u, '')
        return (
          PROFILE_THEMES.find(
            ({ label }) => label.toLowerCase() === targetTheme.toLowerCase(),
          )?.label ?? targetTheme
        )
      }
      const themes = matchingThemes(query)
      return themes.length === 1 ? themes[0]?.label : undefined
    }
    default:
      return assignment
  }
}

const getSection = (
  instruction: string,
  query: string,
  matched?: (typeof fieldPatterns)[number],
): ProfileAction['section'] => {
  if (matched) return matched.section
  if (
    /\b(?:github|website|links?|url)\b/i.test(instruction) ||
    /https?:\/\/\S+/i.test(query)
  )
    return 'links'
  if (/\b(?:email|phone|contact|social|twitter|x\.com)\b/i.test(instruction))
    return 'contact'
  if (/\b(?:address(?:es)?|bitcoin|ethereum)\b/i.test(instruction))
    return 'addresses'
  if (/\b(?:appearance|theme)\b/i.test(instruction)) return 'appearance'
  return 'general'
}

const fieldAction = (
  name: string | undefined,
  matched: (typeof fieldPatterns)[number],
  query: string,
  explicitValue: boolean,
  assignment: Assignment,
): ProfileAction => {
  const value = explicitValue
    ? getFieldValue(matched.field, query, assignment.value)
    : undefined
  const expectedValue = assignment.expectedValue
    ? getFieldValue(
        matched.field,
        assignment.expectedValue,
        assignment.expectedValue,
      )
    : undefined
  return {
    intent: 'edit_profile',
    ...(name && { name }),
    section: matched.section,
    ...(explicitValue && { field: matched.field, ...(value && { value }) }),
    ...(expectedValue && { expectedValue }),
  }
}

const sectionAction = (
  section: ProfileAction['section'],
  instruction: string,
  query: string,
  name: string | undefined,
  hasMutationVerb: boolean,
  explicitValue: boolean,
  assignment: Assignment,
): ProfileAction | null => {
  if (section !== 'links' && explicitValue) return null
  const value =
    section === 'links'
      ? (extractHttpUrl(assignment.value ?? query) ??
        (httpUrlPattern.test(assignment.value ?? query)
          ? undefined
          : assignment.value))
      : undefined
  return {
    intent: 'edit_profile',
    ...(name && { name }),
    section,
    ...(section === 'links' && hasMutationVerb && { linkRequested: true }),
    ...(section === 'links' &&
      /\bgithub\b/i.test(instruction) && { linkService: 'github' as const }),
    ...(value && { value }),
    ...(assignment.expectedValue && {
      expectedValue: assignment.expectedValue,
    }),
  }
}

const stripEditorPrefix = (query: string, name?: string): string => {
  const target = name ? escapePattern(name) : '[^\\s]+\\.eth'
  const prefix = new RegExp(
    `^\\s*(?:please\\s+)?(?:edit|open|update)\\s+(?:(?:my|the)\\s+)?(?:profile(?:\\s+(?:for|of))?(?:\\s+${target})?|${target}(?:['’]s)?\\s+profile)\\s+and\\s+`,
    'i',
  )
  return query.replace(prefix, '')
}

const additionalActionPattern =
  /(?:\b(?:and|then|also|plus)\s+|[;\n]\s*)(?:(?:then|also|please)\s+)*(?:set|change|update|add|replace|use|attach|remove|delete|clear|feature|unfeature|star|unstar|pin|unpin|rename|register|renew|transfer|send|notify|message|share|email|show|list|turn|make|favorite|favourite|edit|open)\b/i
const negatedMutationPattern =
  /\b(?:(?:do\s+not|don['’]?t|dont|never|not)\s+(?:set|change|update|add|replace|use|attach|edit|make|put|remove|delete|clear|feature|unfeature|star|unstar|pin|unpin|rename)|without\s+(?:setting|changing|updating|adding|replacing|using|attaching|editing)|(?:leave|keep)\b.*\b(?:unchanged|as\s+is))\b/i

const mutationPattern =
  /\b(?:set|change|update|add|use|attach|replace|make|put|swap|switch|remove|delete|clear|feature|unfeature|star|unstar|pin|unpin|rename)\b/i
const replacementPattern =
  /\b(?:from|instead\s+of|rather\s+than|replace|swap)\b|,\s*not\b/i

// Normalize only instruction text after literal values and the ENS target have
// been masked. This must never correct a username, record value, or ENS name.
const normalizeProfileOperationWords = (instruction: string) =>
  instruction.replace(/\bremvoe\b/gi, 'remove').replace(/\bunpn\b/gi, 'unpin')

const readProfileValueRoles = (
  candidates: readonly ProfileValueCandidate[],
  answers: Record<string, unknown> | undefined,
) => {
  const choices = ['none', ...candidates.map(({ id }) => id)]
  const valueAnswer = readProfileAnswer(answers, 'profile_value', choices)
  const previousAnswer = readProfileAnswer(
    answers,
    'profile_previous_value',
    choices,
  )
  if (valueAnswer.status === 'invalid' || previousAnswer.status === 'invalid')
    return null
  // Exact local assignment syntax is independent evidence. An uncertain role
  // answer may not replace it, but must not veto it or create a guessed value.
  const valueId =
    valueAnswer.status === 'confident' ? valueAnswer.choice : undefined
  const previousId =
    previousAnswer.status === 'confident' ? previousAnswer.choice : undefined
  return { valueId, previousId }
}

const modelAssignment = (
  query: string,
  assignment: Assignment,
  field: ProfileField | undefined,
  name: string | undefined,
  answers: Record<string, unknown> | undefined,
): Assignment | null => {
  const { candidates } = buildProfileValueContext(query)
  const roles = readProfileValueRoles(candidates, answers)
  if (!roles) return null
  const { valueId, previousId } = roles
  if (valueId && valueId !== 'none' && valueId === previousId) return null
  const selected = candidates.find(({ id }) => id === valueId)?.value
  const previous = candidates.find(({ id }) => id === previousId)?.value
  const value = cleanAssignmentValue(selected, name, field)
  const expectedValue = cleanAssignmentValue(previous, name, field)
  // A model role cannot reverse a locally explicit old/new replacement or
  // invent a previous-value condition that the user never supplied.
  if (expectedValue && !replacementPattern.test(maskQuotedValues(query)))
    return null
  if (
    assignment.expectedValue &&
    ((expectedValue && expectedValue !== assignment.expectedValue) ||
      (value && value !== assignment.value))
  )
    return null
  if (
    value &&
    assignment.value &&
    candidates.some(({ value: candidate }) => candidate === assignment.value) &&
    value !== assignment.value
  )
    return null
  return {
    ...assignment,
    ...(value && { value }),
    ...(expectedValue && { expectedValue }),
  }
}

const readProfileDetails = (answers: Record<string, unknown> | undefined) => {
  const fieldAnswer = readProfileAnswer(answers, 'profile_field', [
    ...fieldPatterns.map(({ field }) => field),
    'link',
    'none',
    'unknown',
    'unsupported',
  ])
  const operationAnswer = readProfileAnswer(answers, 'profile_operation', [
    'set',
    'replace',
    'remove',
    'feature',
    'unfeature',
    'use_eth',
    'rename',
    'open',
    'unclear',
    'unsupported',
    'none',
  ])
  if (fieldAnswer.status === 'invalid' || operationAnswer.status === 'invalid')
    return null
  const chosenField =
    fieldAnswer.status === 'confident'
      ? fieldAnswer.choice
      : fieldAnswer.status === 'uncertain'
        ? null
        : undefined
  const operation =
    operationAnswer.status === 'confident' ? operationAnswer.choice : undefined
  if (chosenField === 'unsupported' || operation === 'unsupported') return null
  return { chosenField, operation }
}

const getLinkedResource = (fieldInstruction: string) => {
  if (
    new RegExp(
      `\\b(?:github\\s+(?:as\\s+${profileLinkDestinationWords}|(?:profile\\s+)?links?)|links?\\s+(?:for|to|on)\\s+(?:my\\s+)?github)\\b`,
      'i',
    ).test(fieldInstruction)
  )
    return 'github'
  if (/\bwebsite\s+links?\b/i.test(fieldInstruction)) return 'website'
  return undefined
}

const hasEthReuseCue = (instruction: string): boolean =>
  /\b(?:use|reuse|copy|enable|receive|match)\b/i.test(instruction) &&
  /\b(?:ethereum|eth)\s+(?:address|record)\b/i.test(instruction)

const resolveProfileFieldChoice = (
  instruction: string,
  chosenField: string | undefined | null,
  ethReuse: boolean,
) => {
  const linkResource = getLinkedResource(instruction)
  if (linkResource && linkResource === chosenField) return 'link'
  // Ethereum is the source record here; the editable destination is a chain.
  if (ethReuse && chosenField === 'eth_address') return 'address'
  return chosenField
}

const matchProfileField = (
  fieldInstruction: string,
  chosenField: string | undefined | null,
) => {
  const explicitLink = /\blinks?\b/i.test(fieldInstruction)
  const linkResource = getLinkedResource(fieldInstruction)
  const ethReuse = hasEthReuseCue(fieldInstruction)
  const modelField = resolveProfileFieldChoice(
    fieldInstruction,
    chosenField,
    ethReuse,
  )
  if (
    explicitLink &&
    /\bgithub\b/i.test(fieldInstruction) &&
    linkResource !== 'github'
  )
    return null
  const networks = findProfileNetworks(
    normalizeProfileNetworkWords(fieldInstruction),
  )
  const networkRequested =
    ethReuse ||
    (networks.length > 0 &&
      /\b(?:address(?:es)?|records?|receive|crypto|chain)\b/i.test(
        fieldInstruction,
      ))
  const matchedFields = fieldPatterns.filter(
    ({ field, pattern }) =>
      (pattern.test(fieldInstruction) ||
        (field === 'address' && networkRequested)) &&
      !(field === 'github' && explicitLink) &&
      !(field === 'website' && explicitLink) &&
      !(field === 'eth_address' && networkRequested),
  )
  if (matchedFields.length > 1) return null
  const socialProof = readCompleteSocialProfileRequest(fieldInstruction)
  const localField =
    matchedFields[0] ??
    fieldPatterns.find(({ field }) => field === socialProof?.field)
  if (
    (localField &&
      modelField &&
      !['none', 'unknown', localField.field].includes(modelField)) ||
    (explicitLink &&
      modelField &&
      !['link', 'none', 'unknown'].includes(modelField))
  )
    return null
  const matched =
    localField ?? fieldPatterns.find(({ field }) => field === modelField)
  if (matched && explicitLink) return null
  return {
    matched,
    chosenField: modelField,
    networks: networkRequested ? networks : [],
  }
}

const getLiteralOperation = (
  instruction: string,
): ProfileOperation | undefined => {
  if (
    /\b(?:unfeature|unstar|unpin)\b|\bremove\b.*\b(?:featured|primary\s+contacts)\b/i.test(
      instruction,
    )
  )
    return 'unfeature'
  if (/\b(?:feature|star|pin)\b|\badd\b.*\bfeatured\b/i.test(instruction))
    return 'feature'
  if (/\b(?:remove|delete|clear|unset)\b/i.test(instruction)) return 'remove'
  if (isProfileLinkRename(instruction)) return 'rename'
  return undefined
}

const readNetwork = (
  networks: ReturnType<typeof findProfileNetworks>,
  answers?: Record<string, unknown>,
) => {
  const choice = readProfileAnswer(answers, 'profile_network', [
    'none',
    'unknown',
    ...networks.map(({ coinType }) => `coin_${coinType}`),
  ])
  if (choice.status === 'invalid' || networks.length > 1) return null
  const exact = networks[0]?.coinType
  if (
    choice.status === 'confident' &&
    choice.choice.startsWith('coin_') &&
    choice.choice !== `coin_${exact}`
  )
    return null
  return { coinType: exact }
}

const hasUnsupportedField = (
  instruction: string,
  _fieldInstruction: string,
  _hasField: boolean,
) =>
  /\b(?:contenthash|content\s+hash|resolver|permissions?|subnames?|transfer|abi|generate|invent|write\s+(?:me|a|my)\s+(?:bio|description))\b/i.test(
    instruction,
  )

const hasExplicitFieldEdit = (
  instruction: string,
  matched: (typeof fieldPatterns)[number] | undefined,
): boolean => {
  if (!matched) return false
  return (
    /\bedit\b/i.test(instruction) &&
    matched.pattern.test(instruction) &&
    // Appearance names the whole section; theme names its editable record.
    (matched.field !== 'theme' || /\btheme\b/i.test(instruction))
  )
}

const finishProfileAction = (
  name: string | undefined,
  query: string,
  instruction: string,
  fieldInstruction: string,
  matched: (typeof fieldPatterns)[number] | undefined,
  assignment: Assignment,
  chosenField: string | undefined | null,
  operation: string | undefined,
): ProfileAction | null => {
  const section =
    chosenField === 'link'
      ? 'links'
      : getSection(fieldInstruction, query, matched)
  const hasMutationVerb =
    mutationPattern.test(instruction) ||
    hasExplicitFieldEdit(fieldInstruction, matched) ||
    operation === 'set' ||
    operation === 'replace' ||
    (section === 'general' &&
      /\bedit\b.*\b(?:records?|details?)\b/i.test(instruction))
  const explicitValue = hasMutationVerb || assignment.value !== undefined
  if (
    !matched &&
    section !== 'links' &&
    explicitValue &&
    (chosenField === 'unknown' ||
      chosenField === null ||
      chosenField === undefined ||
      chosenField === 'none')
  )
    return {
      intent: 'edit_profile',
      ...(name && { name }),
      section,
      fieldRequested: true,
      ...assignment,
    }
  return matched
    ? fieldAction(name, matched, query, explicitValue, assignment)
    : sectionAction(
        section,
        instruction,
        query,
        name,
        hasMutationVerb,
        explicitValue,
        assignment,
      )
}

const readProfileScope = (
  query: string,
  name?: string,
  answers?: Record<string, unknown>,
) => {
  const scopedQuery = stripEditorPrefix(query, name)
  // Check state roles before extraction: an unsupported leading phrase can
  // otherwise be mistaken for a value and hide its social resource.
  if (
    (hasUnquotedSocialStateRole(scopedQuery) ||
      hasSocialMarkerOperation(scopedQuery)) &&
    !readCompleteSocialProfileRequest(scopedQuery)
  )
    return null
  // Values may contain field words without selecting another destination field.
  const instruction = maskQuotedValues(scopedQuery)
    .replace(/https?:\/\/\S+/gi, '[URL]')
    .replace(/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/g, '[EMAIL]')
  if (
    additionalActionPattern.test(instruction) ||
    /\b(?:if|unless|except|only\s+when)\b/i.test(instruction) ||
    negatedMutationPattern.test(instruction)
  )
    return null
  const context = buildProfileValueContext(scopedQuery)
  const fieldInstruction = name
    ? context.state.replace(new RegExp(escapePattern(name), 'gi'), '[NAME]')
    : context.state
  const normalizedInstruction = normalizeProfileOperationWords(fieldInstruction)
  if (
    negatedMutationPattern.test(normalizedInstruction) ||
    additionalActionPattern.test(normalizedInstruction)
  )
    return null
  const details = readProfileDetails(answers)
  if (!details) return null
  const { chosenField, operation } = details
  const match = matchProfileField(fieldInstruction, chosenField)
  if (!match) return null
  const { matched, networks } = match
  if (hasUnsupportedField(instruction, fieldInstruction, matched !== undefined))
    return null
  const network = readNetwork(networks, answers)
  if (!network) return null

  return {
    query,
    scopedQuery,
    name,
    answers,
    instruction,
    context,
    fieldInstruction,
    chosenField: match.chosenField,
    operation,
    matched,
    network,
  }
}

type ProfileScope = NonNullable<ReturnType<typeof readProfileScope>>

/** A social record operation is distinct from starring the ENS name itself. */
export const hasExplicitSocialProfileOperation = (
  query: string,
  name: string | undefined,
  answers: Record<string, unknown>,
): boolean => {
  const scope = readProfileScope(query, name, answers)
  if (!scope || scope.context.candidates.length > 0 || !scope.matched)
    return false
  const field = PROFILE_FIELD_DEFINITIONS.find(
    ({ field, storage }) =>
      field === scope.matched?.field && storage === 'social',
  )
  if (!field) return false
  const rawField = readProfileAnswer(answers, 'profile_field', [
    ...fieldPatterns.map(({ field }) => field),
    'link',
    'none',
    'unknown',
    'unsupported',
  ])
  // "none" abstains from identifying a profile field. A complete literal
  // social instruction can identify it; another selected field cannot.
  if (
    !('choice' in rawField) ||
    ![field.field, 'none'].includes(rawField.choice)
  )
    return false
  const instruction = normalizeProfileOperationWords(scope.fieldInstruction)
  const operation = getLiteralOperation(instruction)
  if (
    !operation ||
    !['feature', 'unfeature', 'remove'].includes(operation) ||
    scope.operation !== operation
  )
    return false
  const resource = instruction.replace(field.pattern, '[SOCIAL]')
  const suffix = '(?: (?:contact|account|record|handle|username))?'
  const named = "\\[NAME\\](?:['’]s)?"
  const target = `(?: (?:on|for|of|in|from) (?:(?:my|the) )?(?:profile (?:of |for )?)?${named})?`
  return new RegExp(
    `^(?:please )?(?:feature|star|pin|unfeature|unstar|unpin|remove|delete|clear|unset) (?:(?:my|the) )?(?:\\[SOCIAL\\]${suffix}${target}|${named} (?:profile )?\\[SOCIAL\\]${suffix})[.!?]?$`,
    'i',
  ).test(resource.trim().replace(/\s+/g, ' '))
}

const getEthReuseInstruction = (scope: ProfileScope): string => {
  const targetMasked = scope.name
    ? scope.instruction.replace(
        new RegExp(escapePattern(scope.name), 'gi'),
        '[NAME]',
      )
    : scope.instruction
  return maskProfileNetworkReference(targetMasked, scope.network.coinType)
    .replace(/\[NAME\](?:['’]s)\s+/gi, '')
    .replace(
      /\b(?:on|of|from|for|in)\s+(?:(?:my|the)\s+)?(?:profile\s+)?\[NAME\](?:['’]s)?/gi,
      '',
    )
    .replace(
      /\b(?:on|in|for|from)\s+(?:(?:my|the)\s+profile|(?:the\s+)?(?:same|this|that)\s+profile)\b/gi,
      '',
    )
    .replace(
      /\b(?:(?:my|the|its|current|saved|existing|same)\s+)*(?:ethereum|eth)\s+(?:address|record)\b/gi,
      '[ETH_RECORD]',
    )
    .replace(
      /\[ETH_RECORD\]\s+(?:already\s+)?saved\s+there\b/gi,
      '[ETH_RECORD]',
    )
    .replace(/^\s*please\s+|\s+(?:please|pls|plz)[.!?]*\s*$/gi, '')
    .replace(/^\s*[,;]\s*/, '')
    .replace(/[.!?]+\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const parseEthReuse = (scope: ProfileScope): ProfileAction | null => {
  if (scope.matched?.field !== 'address') return null
  if (profileOperationConflicts('use_eth', scope.operation)) return null
  const instruction = getEthReuseInstruction(scope)
  const target =
    '(?:(?:my|the|its) )?(?:\\[NETWORK\\](?: (?:address|record))?|(?:an? |another |a different )?(?:network|chain)(?: address| record)?)'
  const sourceFirst = new RegExp(
    `^(?:use|reuse|copy|receive) \\[ETH_RECORD\\](?: (?:for|as|on|to|into) ${target})?$`,
    'i',
  )
  const targetFirst = new RegExp(
    `^(?:use|enable|receive) ${target} (?:with|using) \\[ETH_RECORD\\]$`,
    'i',
  )
  const targetStatement = new RegExp(
    `^(?:make )?${target} (?:(?:should|must) )?(?:use|reuse|match) \\[ETH_RECORD\\]$`,
    'i',
  )
  if (
    !sourceFirst.test(instruction) &&
    !targetFirst.test(instruction) &&
    !targetStatement.test(instruction)
  )
    return null
  return {
    intent: 'edit_profile',
    ...(scope.name && { name: scope.name }),
    section: 'addresses',
    field: 'address',
    operation: 'use_eth',
    ...(scope.network.coinType !== undefined && {
      addressCoinType: scope.network.coinType,
    }),
  }
}

const profileOperationConflicts = (
  literalOperation: ProfileOperation | undefined,
  operation: string | undefined,
): boolean => {
  if (
    literalOperation &&
    operation &&
    !['none', 'unclear', literalOperation].includes(operation)
  )
    return true
  if (
    !literalOperation &&
    operation &&
    ['remove', 'feature', 'unfeature', 'use_eth', 'rename'].includes(operation)
  )
    return true
  return false
}

const getRemovalConstraint = (
  scope: ProfileScope,
  linkTitle?: string,
): { readonly expectedValue?: string } | null => {
  const values = scope.context.candidates.filter(
    ({ value }) => value !== linkTitle && value !== scope.name,
  )
  // A removal may qualify the old value but can never assign a new value.
  // Preserve one exact qualification; reject competing literals as a whole.
  if (values.length > 1) return null
  const value = values[0]
  return value ? { expectedValue: value.value } : {}
}

const finishBoundedLink = (
  scope: ProfileScope,
  operation: ProfileOperation | undefined,
  link: ProfileActionDetails,
): ProfileAction | null => {
  const { matched, chosenField, name } = scope
  if (
    matched ||
    (chosenField && !['none', 'unknown', 'link'].includes(chosenField))
  )
    return null
  const constraint =
    operation === 'remove'
      ? getRemovalConstraint(scope, link.linkTarget ?? link.linkName)
      : {}
  if (!constraint) return null
  return {
    intent: 'edit_profile',
    ...(name && { name }),
    ...link,
    ...constraint,
  }
}

const hasSocialDetailConflict = (
  scope: ProfileScope,
  proof: CompleteSocialProfileRequest,
): boolean => {
  const genericOperation =
    proof.syntax === 'state'
      ? 'set'
      : proof.syntax === 'pin_removal'
        ? 'remove'
        : undefined
  const rawOperation = readProfileAnswer(scope.answers, 'profile_operation', [
    'set',
    'replace',
    'remove',
    'feature',
    'unfeature',
    'use_eth',
    'rename',
    'open',
    'unclear',
    'unsupported',
    'none',
  ])
  const weakGenericSet =
    rawOperation.status === 'uncertain' && rawOperation.choice === 'set'
  if (
    'choice' in rawOperation &&
    !weakGenericSet &&
    !['none', 'unclear', genericOperation, proof.operation].includes(
      rawOperation.choice,
    )
  )
    return true
  const rawField = readProfileAnswer(scope.answers, 'profile_field', [
    ...fieldPatterns.map(({ field }) => field),
    'link',
    'none',
    'unknown',
    'unsupported',
  ])
  return (
    'choice' in rawField &&
    !['none', 'unknown', proof.field].includes(rawField.choice)
  )
}

const parseCompleteSocialOperation = (
  scope: ProfileScope,
): ProfileAction | null | undefined => {
  const { matched, name } = scope
  const proof = readCompleteSocialProfileRequest(scope.fieldInstruction)
  if (!proof) return undefined
  if (
    (proof.field && matched?.field !== proof.field) ||
    hasSocialDetailConflict(scope, proof)
  )
    return null
  return {
    intent: 'edit_profile',
    ...(name && { name }),
    ...(proof.field ? { field: proof.field } : { fieldRequested: true }),
    section: 'contact',
    operation: proof.operation,
  }
}

const hasUnresolvedSocialOperation = (
  instruction: string,
  operation: ProfileOperation | undefined,
): boolean =>
  operation === 'feature' ||
  operation === 'unfeature' ||
  hasUnquotedSocialStateRole(instruction) ||
  /\bremove\s+(?:the\s+|a\s+)?(?:pin|star)\s+from\b/i.test(instruction)

const parseBoundedOperation = (
  scope: ProfileScope,
): ProfileAction | null | undefined => {
  const { scopedQuery, operation, matched, name, network } = scope
  const completeSocial = parseCompleteSocialOperation(scope)
  if (completeSocial !== undefined) return completeSocial
  const literalOperation = getLiteralOperation(
    normalizeProfileOperationWords(scope.fieldInstruction),
  )
  // Featuring a contact has no free-form value slot. Any unconsumed clause
  // must be resolved rather than silently opening a partial contact proposal.
  if (hasUnresolvedSocialOperation(scope.fieldInstruction, literalOperation))
    return null
  if (profileOperationConflicts(literalOperation, operation)) return null
  const namedLink = parseNamedProfileLink(scopedQuery, literalOperation)
  if (namedLink) return finishBoundedLink(scope, literalOperation, namedLink)
  if (literalOperation) {
    if (!matched || literalOperation === 'rename') return null
    const constraint =
      literalOperation === 'remove' ? getRemovalConstraint(scope) : {}
    if (!constraint) return null
    return {
      intent: 'edit_profile',
      ...(name && { name }),
      field: matched.field,
      section: matched.section,
      operation: literalOperation,
      ...constraint,
      ...(matched.field === 'address' &&
        network.coinType !== undefined && {
          addressCoinType: network.coinType,
        }),
    }
  }

  return undefined
}

const isExplicitProfileOpening = (scope: ProfileScope): boolean => {
  const instruction = normalizeProfileOperationWords(scope.fieldInstruction)
  const opening =
    /^(?:(?:please|can you|could you|i want to|i would like to)\s+)?(?:open|show(?:\s+me)?|view|edit|manage)\s+/i.exec(
      instruction.trim(),
    )
  if (!opening) return false
  const remaining = instruction
    .trim()
    .slice(opening[0].length)
    .replace(/\[NAME\](?:['’]s)?/gi, '')
    .replace(scope.matched?.pattern ?? /$^/, '')
    .replace(
      /\b(?:my|the|a|an|for|on|in|of|profile|editor|section|tab|general|contact|social|records|address(?:es)?|links|appearance|please|pls|plz)\b/gi,
      '',
    )
    .replace(/[\s.!?]+/g, '')
  // An unresolved operation is never permission to silently open a tab. Only
  // a complete navigation request may return an action without a proposal.
  return remaining === ''
}

const isEditorOnlyAction = (action: ProfileAction): boolean =>
  !action.field &&
  !action.fieldRequested &&
  !action.linkRequested &&
  !action.value &&
  !action.linkName &&
  !action.linkTarget &&
  !action.operation

export const parseProfileSection = (
  query: string,
  name?: string,
  answers?: Record<string, unknown>,
): ProfileAction | null => {
  const scope = readProfileScope(query, name, answers)
  if (!scope) return null
  if (!readProfileValueRoles(scope.context.candidates, answers)) return null
  if (hasEthReuseCue(scope.fieldInstruction) || scope.operation === 'use_eth')
    return parseEthReuse(scope)
  const bounded = parseBoundedOperation(scope)
  if (bounded !== undefined) return bounded
  const {
    scopedQuery,
    instruction,
    fieldInstruction,
    chosenField,
    operation,
    matched,
    network,
  } = scope
  const localAssignment = parseAssignment(scopedQuery, name, matched?.field)
  if (!localAssignment) return null
  const assignment = modelAssignment(
    query,
    localAssignment,
    matched?.field,
    name,
    answers,
  )
  if (!assignment) return null
  if (
    matched?.field === 'theme' &&
    !assignment.value &&
    matchingThemes(instruction).length > 1
  )
    return null
  const action = finishProfileAction(
    name,
    scopedQuery,
    instruction,
    fieldInstruction,
    matched,
    assignment,
    chosenField,
    operation,
  )
  if (action && isEditorOnlyAction(action) && !isExplicitProfileOpening(scope))
    return null
  return action &&
    matched?.field === 'address' &&
    network.coinType !== undefined
    ? { ...action, addressCoinType: network.coinType }
    : action
}

// A generic “edit my profile and …” lead-in and the field edit are one action.
// Only a fully extracted, bounded field assignment can relax conjunction checks.
export const isSingleProfileEdit = (
  query: string,
  name?: string,
  answers?: Record<string, unknown>,
): boolean => {
  const action = parseProfileSection(query, name, answers)
  return action?.field !== undefined || action?.fieldRequested === true
}
