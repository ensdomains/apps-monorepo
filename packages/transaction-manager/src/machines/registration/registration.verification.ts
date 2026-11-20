import type { verifyRegistrationActor } from './registration.actors'
import type { verifyHcaRegistrationActor } from './registration.hca.actors'
import type { RegistrationContext } from './registration.machine'

export type RegistrationVerification =
  | {
      readonly mode: 'eoa'
      readonly input: Parameters<typeof verifyRegistrationActor>[0]
    }
  | {
      readonly mode: 'hca'
      readonly input: Parameters<typeof verifyHcaRegistrationActor>[0]
    }

/** Pin read-only verification inputs before submission can outlive its parent actor. */
export const getRegistrationVerification = (
  context: Pick<
    RegistrationContext,
    | 'name'
    | 'duration'
    | 'signer'
    | 'accountAddress'
    | 'ownerAddress'
    | 'publicClient'
    | 'commitment'
    | 'resolverAddress'
    | 'registrationIntentId'
    | 'fetchRegistrationIntentStatus'
  >,
): RegistrationVerification | undefined => {
  const owner = context.ownerAddress ?? context.accountAddress
  if (!owner || !context.publicClient || !context.commitment) return undefined
  const common = {
    name: context.name,
    publicClient: context.publicClient,
    commitment: context.commitment.commitment,
  }
  if (context.signer?.type === 'rhinestone' && context.accountAddress)
    return {
      mode: 'hca',
      input: {
        ...common,
        wallet: owner,
        hca: context.accountAddress,
        duration: context.duration,
        intentId: context.registrationIntentId,
        fetchIntentStatus: context.fetchRegistrationIntentStatus,
      },
    }
  if (context.signer?.type === 'eoa' && context.resolverAddress)
    return {
      mode: 'eoa',
      input: { ...common, owner, resolverAddress: context.resolverAddress },
    }
  return undefined
}
