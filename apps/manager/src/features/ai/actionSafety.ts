import { normalize } from 'viem/ens'
import { PROFILE_FIELD_DEFINITIONS } from '@/features/profile/service/profileFieldRegistry'
import { readDetailChoice } from './actionDetails'
import { readCompleteSocialProfileRequest } from './completeSocialProfileRequest'
import {
  hasExplicitAddressCopyOperation,
  parseProfileAddressCopyTarget,
} from './profileAddressCopy'
import {
  hasCompletePrimaryProfileRequest,
  hasCompleteProfileOwnerCopyRequest,
  hasCompleteProfileOwnerViewRequest,
} from './profileNativeRead'
import { buildProfileValueContext } from './profileValueContext'

const stripNamePunctuation = (value: string): string =>
  value.replace(/^["'([{]+|["')\]},.!?;:]+$/g, '').replace(/['’]s$/i, '')

const normalizedCandidate = (value: string): string | null => {
  try {
    return normalize(stripNamePunctuation(value)).toLowerCase()
  } catch {
    return null
  }
}

/** A model-selected name cannot be a name the user explicitly excluded. */
export const isExplicitlyExcludedAiTarget = (
  query: string,
  targetName: string,
): boolean => {
  const target = normalizedCandidate(targetName)
  if (!target) return false
  return [...query.matchAll(/[^\s/@]+\.[^\s/@]+/gu)].some((match) => {
    if (normalizedCandidate(match[0]) !== target) return false
    const prefix = query.slice(0, match.index)
    return /\b(?:not|except|excluding|exclude|without|skip|omit|avoid|leave\s+out|rather\s+than|instead\s+of)\s+(?:(?:using|choosing)\s+|the\s+name\s+)?$/i.test(
      prefix,
    )
  })
}

/** Only unambiguous literal named actions constrain semantic classification. */
export const getExplicitNameAction = (
  query: string,
): 'register' | 'renew' | null => {
  const match = query.match(
    /\b(register|buy|claim|renew|extend|get)\s+(?:(?:me|my|the|this|that)\s+)?([^\s/@]+\.[^\s/@]+)/iu,
  )
  if (!match?.[2] || !normalizedCandidate(match[2])) return null
  const verb = match[1]?.toLowerCase()
  if (verb === 'renew' || verb === 'extend') return 'renew'
  if (verb !== 'get') return 'register'
  const suffix = query.slice((match.index ?? 0) + match[0].length)
  // "Get alice.eth renewed/set as primary" describes the following action,
  // while "get alice.eth for 69 days" directly requests acquiring the name.
  if (/^\s+(?:renewed|extended|set|as|to\s+be|upgraded)\b/i.test(suffix))
    return null
  return 'register'
}

export const hasExplicitNameActionConflict = (
  query: string,
  interpretedIntent: string,
): boolean => {
  if (interpretedIntent !== 'register' && interpretedIntent !== 'renew')
    return false
  const explicit = getExplicitNameAction(query)
  return explicit !== null && explicit !== interpretedIntent
}

const profileMutationPattern =
  /\b(?:set|change|update|add|replace|use|make|put|attach|swap|switch|edit|remove|remvoe|delete|clear|unset|feature|unfeature|star|unstar|pin|unpin|unpn|bookmark|unbookmark|favou?rite|unfavou?rite|save)\b|\bshould\s+be\b|[:=]/i
const profileFieldPattern =
  /\b(?:description|bio|avatar|profile\s+(?:photo|picture)|email|e-mail|github|(?:ethereum|eth|evm)\s+address|theme|appearance|links?|website)\b/i
const profileContextPattern =
  /\b(?:profile|records?|githb|gitub|gihub|githup|descreption|avatr|eamil)\b/i
const profileChoices = [
  ...PROFILE_FIELD_DEFINITIONS.map(({ field }) => field),
  'eth_address',
  'address',
  'theme',
  'link',
]

const hasNameFavoriteResourceConflict = (
  query: string,
  instruction: string,
  interpretedIntent: string,
  answers: Record<string, unknown>,
): boolean => {
  const nameFavorite =
    interpretedIntent === 'favorite' ||
    (interpretedIntent === 'manager_action' &&
      readDetailChoice(answers, 'manager_action', ['unfavorite']) !== null)
  if (!nameFavorite) return false
  // A fully stated social operation remains a different resource even when
  // the model cannot supply consistent metadata to prepare that operation.
  if (readCompleteSocialProfileRequest(query)) return true
  const markerTarget = instruction
    .match(
      /\b(?:put\s+(?:a\s+|the\s+)?(?:star|pin)\s+on|take\s+(?:a\s+|the\s+)?(?:star|pin)\s+off)\s+(.+)$/i,
    )?.[1]
    ?.replace(/^(?:the|my|an?)\s+/i, '')
  if (markerTarget && !markerTarget.startsWith('[NAME]')) return true
  return (
    profileMutationPattern.test(instruction) &&
    (PROFILE_FIELD_DEFINITIONS.some(({ pattern }) =>
      pattern.test(instruction),
    ) ||
      /\b(?:social|contact|account|handle|username|records?|address(?:es)?|resolver)\b/i.test(
        instruction,
      ))
  )
}

const isNativeAccountSetting = (query: string, interpretedIntent: string) =>
  interpretedIntent === 'manager_action' &&
  !/\b(?:profile|records?)\b/i.test(query) &&
  !/[^\s/@]+\.eth\b/i.test(query)

const isProfileAddressCopy = (
  query: string,
  interpretedIntent: string,
  answers: Record<string, unknown>,
): boolean =>
  interpretedIntent === 'manager_action' &&
  readDetailChoice(answers, 'manager_action', ['copy_profile_address']) ===
    'copy_profile_address' &&
  hasExplicitAddressCopyOperation(query) &&
  parseProfileAddressCopyTarget(query, answers) !== null

const isProfileLinkShare = (
  query: string,
  instruction: string,
  interpretedIntent: string,
): boolean =>
  interpretedIntent === 'manager_action' &&
  /\b(?:copy|clipboard|share|qr)\b/i.test(query) &&
  /\b(?:profile\b.*\blink|link\b.*\bprofile)\b/i.test(query) &&
  !/\b(?:set|edit|change|update|replace|add|remove)\b/i.test(instruction)

const isNativeProfileRead = (
  query: string,
  interpretedIntent: string,
  answers: Record<string, unknown>,
): boolean => {
  if (interpretedIntent !== 'manager_action') return false
  if (isProfileAddressCopy(query, interpretedIntent, answers)) return true
  const kind = readDetailChoice(answers, 'manager_action', [
    'view_primary_profile',
    'copy_profile_owner',
    'view_profile_owner',
  ])
  return (
    (kind === 'view_primary_profile' &&
      hasCompletePrimaryProfileRequest(query)) ||
    (kind === 'copy_profile_owner' &&
      hasCompleteProfileOwnerCopyRequest(query)) ||
    (kind === 'view_profile_owner' && hasCompleteProfileOwnerViewRequest(query))
  )
}

/** An address/profile record assignment cannot become a primary-name proposal. */
export const hasProfileActionConflict = (
  query: string,
  interpretedIntent: string,
  answers: Record<string, unknown> = {},
): boolean => {
  if (interpretedIntent === 'edit_profile') return false
  const instruction = buildProfileValueContext(query)
    .state.replace(/\S*[.@]\S*/g, '[NAME]')
    .replace(/"[^"]*"|(?<![\p{L}\p{N}])'[^']*'|“[^”]*”|‘[^’]*’/gu, '[VALUE]')
  if (
    hasNameFavoriteResourceConflict(
      query,
      instruction,
      interpretedIntent,
      answers,
    )
  )
    return true
  // Account contact methods and language are distinct native settings, not ENS records.
  if (isNativeAccountSetting(query, interpretedIntent)) return false
  if (isNativeProfileRead(query, interpretedIntent, answers)) return false
  if (isProfileLinkShare(query, instruction, interpretedIntent)) return false
  const field =
    PROFILE_FIELD_DEFINITIONS.filter(
      ({ field }) =>
        !(
          field === 'display_name' &&
          interpretedIntent === 'set_primary' &&
          /\bwallet\b/i.test(instruction)
        ),
    )
      .map(({ pattern }) => pattern.exec(instruction))
      .filter((match) => match !== null)
      .sort((a, b) => a.index - b.index)[0] ??
    profileFieldPattern.exec(instruction)
  const primary = /\b(?:primary|main|reverse)\b/i.exec(instruction)
  const hasMutation = profileMutationPattern.test(instruction)
  // In "set my primary name for my Ethereum address", address is context.
  // In "change the GitHub of my primary name", GitHub is the destination.
  if (hasMutation && field && (!primary || field.index < primary.index))
    return true
  if (primary || !(field || profileContextPattern.test(instruction)))
    return false
  if (!hasMutation && !/\b(?:profile|records?)\b/i.test(instruction))
    return false
  const semanticField = readDetailChoice(
    answers,
    'profile_field',
    profileChoices,
  )
  const semanticOperation = readDetailChoice(answers, 'profile_operation', [
    'set',
    'replace',
  ])
  return semanticField !== null && semanticOperation !== null
}
