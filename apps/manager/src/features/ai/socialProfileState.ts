import {
  readCompleteSocialProfileRequest,
  type SocialProfileField,
} from './completeSocialProfileRequest'

/** State words here describe an existing contact, never a new record value. */
export const readSocialProfileState = (
  instruction: string,
): {
  readonly field: SocialProfileField
  readonly operation: 'feature' | 'unfeature'
} | null => {
  const proof = readCompleteSocialProfileRequest(instruction)
  if (!proof?.field || proof.syntax !== 'state' || proof.operation === 'remove')
    return null
  return { field: proof.field, operation: proof.operation }
}
