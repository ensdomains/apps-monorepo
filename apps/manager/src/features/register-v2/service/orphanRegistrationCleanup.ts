/**
 * Cleanup for a stored registration whose route will never mount again.
 *
 * `/register/$name` redirects to `/$name` the moment the name stops being
 * available — and the most common way that happens is OUR OWN registration
 * landing while the user was away. The provider that owns the record is behind
 * that redirect, so it never gets the chance to clear it. Left alone, the
 * record shadows every later registration attempt and the user is told their
 * name "expired" when in fact they own it.
 *
 * So the decision has to live somewhere the register route does not: see
 * `useOrphanRegistrationCleanup`, mounted at the router root.
 */

import { getDestinationContracts } from '@ens-apps/smart-account'
import { isAddressEqual, type PublicClient, parseAbi, zeroAddress } from 'viem'
import type { StoredRegistration } from './registrationPersistence'

const registryOwnerAbi = parseAbi([
  'function getOwner(string label) view returns (address)',
])

export type OrphanRegistrationOutcome =
  /** Nothing on-chain yet — the user may still come back to finish. */
  | { readonly status: 'pending' }
  /** The registration landed while the user was away. */
  | { readonly status: 'registered'; readonly label: string }
  /** Someone else holds the name now. */
  | { readonly status: 'taken'; readonly label: string }

/**
 * Decide what became of a stored registration, from the registry alone.
 *
 * Only meaningful once a commitment exists: before that nothing was ever
 * submitted, so an unowned name says nothing about this record.
 */
export async function resolveOrphanRegistration(params: {
  readonly stored: StoredRegistration
  readonly publicClient: PublicClient
  readonly chainId: number
}): Promise<OrphanRegistrationOutcome> {
  const { stored } = params
  const recordOwner = stored.record.context.ownerAddress

  if (!recordOwner || !stored.record.context.commitment) {
    return { status: 'pending' }
  }

  const contracts = getDestinationContracts(params.chainId)

  const owner = await params.publicClient.readContract({
    address: contracts.ethRegistry,
    abi: registryOwnerAbi,
    functionName: 'getOwner',
    args: [stored.label],
  })

  // `isAddressEqual` throws on a malformed address (same reason
  // `resolveVerifiedOwner` in sessionGate.ts guards it). Treat a comparison we
  // cannot make as "still pending": keeping a resumable record costs the user
  // nothing, whereas reporting "taken" would clear a name they may own.
  try {
    if (isAddressEqual(owner, zeroAddress)) {
      return { status: 'pending' }
    }

    return isAddressEqual(owner, recordOwner)
      ? { status: 'registered', label: stored.label }
      : { status: 'taken', label: stored.label }
  } catch {
    return { status: 'pending' }
  }
}
