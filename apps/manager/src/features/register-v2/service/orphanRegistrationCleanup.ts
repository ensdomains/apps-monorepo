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
import {
  isAddressEqual,
  labelhash,
  type PublicClient,
  parseAbi,
  zeroAddress,
} from 'viem'
import type { StoredRegistration } from './registrationPersistence'

// The v2 PermissionedRegistry has no per-label owner getter — ownership is
// read off `getState`, keyed by the label hash (the same way ensjs
// `getNameRolesAccounts` reads it). `latestOwner` is zero for a name that was
// never registered, and the call returns zeros rather than reverting.
const registryGetStateAbi = parseAbi([
  'struct NameState { uint8 status; uint64 expiry; address latestOwner; uint256 tokenId; uint256 resource; }',
  'function getState(uint256 anyId) view returns (NameState state)',
])

/** The registry's own enum value; matches `verifyHcaRegistrationActor`. */
const STATUS_REGISTERED = 2

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

  const state = await params.publicClient.readContract({
    address: contracts.ethRegistry,
    abi: registryGetStateAbi,
    functionName: 'getState',
    args: [BigInt(labelhash(stored.label))],
  })

  // An EXPIRED name keeps its previous `latestOwner` while its status falls
  // back to available — and the temporary-premium flow registers exactly such
  // names. Reading ownership off anything but a REGISTERED state would
  // misread that history as a live owner and clear a paid commitment (plus
  // toast a false "registered"/"taken") for a registration still in flight.
  if (Number(state.status) !== STATUS_REGISTERED) {
    return { status: 'pending' }
  }

  // `isAddressEqual` throws on a malformed address (same reason
  // `resolveVerifiedOwner` in sessionGate.ts guards it). Treat a comparison we
  // cannot make as "still pending": keeping a resumable record costs the user
  // nothing, whereas reporting "taken" would clear a name they may own.
  try {
    if (isAddressEqual(state.latestOwner, zeroAddress)) {
      return { status: 'pending' }
    }

    return isAddressEqual(state.latestOwner, recordOwner)
      ? { status: 'registered', label: stored.label }
      : { status: 'taken', label: stored.label }
  } catch {
    return { status: 'pending' }
  }
}
