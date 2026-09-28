import { normalize } from 'viem/ens'
import { PROFILE_FIELD_DEFINITIONS } from '@/features/profile/service/profileFieldRegistry'

export type SocialProfileField = Extract<
  (typeof PROFILE_FIELD_DEFINITIONS)[number],
  { readonly storage: 'social' }
>['field']

export type CompleteSocialProfileRequest = {
  readonly field?: SocialProfileField
  readonly fieldRequested: boolean
  readonly operation: 'feature' | 'unfeature' | 'remove'
  readonly syntax: 'verb' | 'state' | 'pin_removal'
}

const maskTargets = (instruction: string): string =>
  instruction.replace(/(?<!\S)([^\s/@]+\.[^\s/@]+)(?!\S)/gu, (token) => {
    const punctuation = token.match(/[.!?,]+$/)?.[0] ?? ''
    const withoutPunctuation = punctuation
      ? token.slice(0, -punctuation.length)
      : token
    const possessive = withoutPunctuation.match(/['’]s$/i)?.[0] ?? ''
    const candidate = possessive
      ? withoutPunctuation.slice(0, -possessive.length)
      : withoutPunctuation
    try {
      // Validation only: the caller retains the exact target. This also
      // accepts ENS emoji labels without correcting a mistyped name.
      normalize(candidate)
      return `[NAME]${possessive}${punctuation}`
    } catch {
      return token
    }
  })

const normalizeInstructionAliases = (instruction: string): string =>
  instruction
    .replace(/\binstgram\b/gi, 'instagram')
    .replace(/\b(?:githb|gitub|gihub|githup|git\s+hub)\b/gi, 'github')
    .replace(/\bfarcastr\b/gi, 'farcaster')
    .replace(/\btelegarm\b/gi, 'telegram')
    .replace(/\bremvoe\b/gi, 'remove')
    .replace(/\bunpn\b/gi, 'unpin')

const polite = '(?:(?:could|can|would) you (?:please )?|please )?'
const name = "\\[NAME\\](?:['’]s)?"
const target = `(?: (?:on|for|of|in|from) (?:(?:my|the) )?(?:profile (?:of |for )?)?${name}(?: profile)?)?`

const socialStateWords =
  '(?:featured|pinned|starred|unfeatured|unpinned|unstarred|not\\s+(?:featured|pinned|starred))'
const socialStateRoleWords =
  '(?:not\\s+)?(?:featured|pinned|starred|unfeatured|unpinned|unstarred)'

export const isUnquotedSocialStateAssignment = (
  prefix: string,
  value: string,
): boolean => {
  if (
    !new RegExp(
      `^\\s*${socialStateRoleWords}(?=$|\\s|[.!?,;](?=$|\\s))`,
      'i',
    ).test(value)
  )
    return false
  const masked = normalizeInstructionAliases(maskTargets(prefix))
  const explicitSlot =
    /\b(?:username|handle)(?:\s+(?:on|for|of|in)\s+(?:(?:my|the)\s+)?(?:profile\s+)?\[NAME\](?:['’]s)?)?\s*$/i.test(
      masked,
    )
  if (explicitSlot) return false
  return (
    PROFILE_FIELD_DEFINITIONS.some(
      (definition) =>
        definition.storage === 'social' && definition.pattern.test(masked),
    ) || /\b(?:social\s+)?contact\b/i.test(masked)
  )
}

/** State roles stay operation text even when surrounding wording is unsupported. */
export const hasUnquotedSocialStateRole = (instruction: string): boolean => {
  const withoutValues = instruction.replace(
    /"[^"]*"|(?<![\p{L}\p{N}])'[^']*'|“[^”]*”|‘[^’]*’/gu,
    (value) => ' '.repeat(value.length),
  )
  return [...withoutValues.matchAll(/\bas\s+/gi)].some((match) =>
    isUnquotedSocialStateAssignment(
      withoutValues.slice(0, match.index),
      withoutValues.slice(match.index + match[0].length),
    ),
  )
}

/** A pin/star is a contact state, never a replacement username. */
export const hasSocialMarkerOperation = (instruction: string): boolean =>
  /\b(?:put\s+(?:the\s+|a\s+)?(?:pin|star)\s+on|take\s+(?:the\s+|a\s+)?(?:pin|star)\s+off|remove\s+(?:the\s+|a\s+)?(?:pin|star)\s+from)\b/i.test(
    instruction.replace(
      /"[^"]*"|(?<![\p{L}\p{N}])'[^']*'|“[^”]*”|‘[^’]*’/gu,
      '',
    ),
  )

const subjectPattern = (
  generic: boolean,
  state = false,
  frontedTarget = false,
): string => {
  const contact = generic
    ? '(?:social )?(?:contact|account)'
    : `\\[SOCIAL\\](?: (?:contact|account|record|profile${state ? '' : '|handle|username'}))?`
  // A fronted target fixes the profile for the entire clause. Do not accept
  // another explicit name later, even if a pronoun could be read either way.
  if (frontedTarget) return `(?:(?:its|my|the|a) )?${contact}`
  return `(?:(?:my|the|a) )?(?:${contact}${target}|${name} (?:profile )?${contact})`
}

const readOperation = (
  resource: string,
  generic: boolean,
  frontedTarget: boolean,
): Pick<CompleteSocialProfileRequest, 'operation' | 'syntax'> | null => {
  const subject = subjectPattern(generic, false, frontedTarget)
  if (
    new RegExp(
      `^${polite}(?:remove (?:the |a )?(?:pin|star) from|take (?:the |a )?(?:pin|star) off) ${subject}[.!?]?$`,
      'i',
    ).test(resource)
  )
    return { operation: 'unfeature', syntax: 'pin_removal' }
  if (
    new RegExp(
      `^${polite}put (?:the |a )?(?:pin|star) on ${subject}[.!?]?$`,
      'i',
    ).test(resource)
  )
    return { operation: 'feature', syntax: 'verb' }
  const stateSubject = subjectPattern(generic, true, frontedTarget)
  const state = new RegExp(
    `^${polite}(?:(?:set|mark) ${stateSubject} as|make ${stateSubject}(?: as)?) (${socialStateWords})[.!?]?$`,
    'i',
  )
    .exec(resource)?.[1]
    ?.toLowerCase()
  if (state)
    return {
      operation: /^(?:un|not )/.test(state) ? 'unfeature' : 'feature',
      syntax: 'state',
    }
  const verb = new RegExp(
    `^${polite}(feature|star|pin|unfeature|unstar|unpin|remove|delete|clear|unset) ${subject}[.!?]?$`,
    'i',
  )
    .exec(resource)?.[1]
    ?.toLowerCase()
  if (!verb) return null
  return {
    operation: /^(?:unfeature|unstar|unpin)$/.test(verb)
      ? 'unfeature'
      : /^(?:feature|star|pin)$/.test(verb)
        ? 'feature'
        : 'remove',
    syntax: 'verb',
  }
}

/** A complete single resource clause, independent of model answers or values. */
export const readCompleteSocialProfileRequest = (
  instruction: string,
): CompleteSocialProfileRequest | null => {
  // Alias matching is instruction-only. Targets are masked first, and quoted
  // values cannot fit the complete resource grammar below.
  const masked = normalizeInstructionAliases(maskTargets(instruction))
  const fields = PROFILE_FIELD_DEFINITIONS.filter(
    (definition) =>
      definition.storage === 'social' && definition.pattern.test(masked),
  )
  if (fields.length > 1) return null
  const field = fields[0]
  if (field && field.storage !== 'social') return null
  const resource = (field ? masked.replace(field.pattern, '[SOCIAL]') : masked)
    .trim()
    .replace(/\s+/g, ' ')
    // Remove only a terminal courtesy wrapper. The remaining operation and
    // resource must still match the entire grammar; values are never changed.
    .replace(/(?:,\s*|\s+)(?:please|pls|plz)[.!?]?$/i, '')
  const fronted = /^(?:for|on) \[NAME\], (.+)$/i.exec(resource)
  const operation = readOperation(fronted?.[1] ?? resource, !field, !!fronted)
  if (!operation) return null
  return {
    ...(field && { field: field.field }),
    fieldRequested: !field,
    ...operation,
  }
}
