import { type Address, isAddressEqual, type PublicClient } from 'viem'
import {
  assessResumableRegistration,
  type ResumeAssessment,
} from '@/features/register-v2/service/assessResumableRegistration'
import type { StoredRegistration } from '@/features/register-v2/service/registrationPersistence'

/**
 * The name whose registration still needs this account's USDC, or `null`.
 *
 * The commit step funds the account and the reveal pays out of it with no way
 * to top up, so withdrawing in between strands the registration in a retry
 * loop. A run that can still continue (resumable, or failed holding its
 * commitment) needs the funds; a stale one (expired, finished, failed before
 * committing) does not.
 */
export const registrationHoldingFunds = (
  assessment: ResumeAssessment,
  hca: Address,
): string | null => {
  if (assessment.status !== 'resumable' && assessment.status !== 'failed') {
    return null
  }
  const { context } = assessment.stored.record
  return context.signerType === 'rhinestone' &&
    context.accountAddress !== undefined &&
    isAddressEqual(context.accountAddress, hca)
    ? context.name
    : null
}

/** {@link registrationHoldingFunds} for the registration stored in this browser. */
export const findRegistrationHoldingFunds = async (params: {
  readonly hca: Address
  readonly chainId: number
  readonly publicClient: PublicClient
  readonly stored: StoredRegistration | null
}): Promise<string | null> => {
  if (!params.stored) return null
  const assessment = await assessResumableRegistration({
    label: params.stored.label,
    chainId: params.chainId,
    publicClient: params.publicClient,
    signerType: 'rhinestone',
    stored: params.stored,
  })
  return registrationHoldingFunds(assessment, params.hca)
}
