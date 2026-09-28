import { PROFILE_FIELD_DEFINITIONS } from '@/features/profile/service/profileFieldRegistry'
import { inspectDetailChoice } from './actionDetails'
import { readCompleteSocialProfileRequest } from './completeSocialProfileRequest'
import { buildProfileValueContext } from './profileValueContext'

const readRawChoice = (
  answer: unknown,
  allowed: readonly string[],
): string | null => inspectDetailChoice(answer, allowed)?.choice ?? null

/**
 * A fully consumed instruction fixes the native resource and operation.
 * Matching weak model choices may corroborate it, but no vote is rewritten;
 * contradictory choices, private value roles, and unknown wording still fail.
 */
export const hasCompleteSocialRequestEvidence = (
  query: string,
  answers: Record<string, unknown>,
): boolean => {
  const context = buildProfileValueContext(query)
  if (context.candidates.length) return false
  const proof = readCompleteSocialProfileRequest(context.state)
  if (!proof) return false
  const field = readRawChoice(answers.profile_field, [
    ...PROFILE_FIELD_DEFINITIONS.map(({ field }) => field),
    'link',
    'none',
    'unknown',
    'unsupported',
  ])
  if (
    field === null ||
    (proof.field
      ? field !== proof.field && field !== 'none'
      : field !== 'none' && field !== 'unknown')
  )
    return false
  const operation = inspectDetailChoice(answers.profile_operation, [
    proof.operation,
    ...(proof.syntax === 'state' ? ['set'] : []),
    ...(proof.syntax === 'pin_removal' ? ['remove'] : []),
    'none',
  ])
  return (
    operation !== null &&
    // With the operation fully stated but its social field missing, an
    // uncertain "none" is an abstention. Ask for that field and retain the
    // literal operation; a confident none or any opposing choice still fails.
    (operation.choice !== 'none' ||
      (proof.fieldRequested && operation.confidence < 0.65)) &&
    readRawChoice(answers.profile_value, ['none']) === 'none' &&
    readRawChoice(answers.profile_previous_value, ['none']) === 'none'
  )
}

export const canResolveCompleteSocialIntent = (
  query: string,
  answers: Record<string, unknown>,
): boolean => {
  const intent = readRawChoice(answers.intent, [
    'edit_profile',
    'favorite',
    'manager_action',
  ])
  if (!intent || !hasCompleteSocialRequestEvidence(query, answers)) return false
  return (
    intent !== 'manager_action' ||
    readRawChoice(answers.manager_action, ['none', 'unfavorite']) !== null
  )
}
