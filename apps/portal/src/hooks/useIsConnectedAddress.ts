import { type Address, isAddressEqual } from 'viem'
import { useConnection } from 'wagmi'

/**
 * Whether `address` is the wallet currently connected.
 *
 * Every reverse-record write is scoped to the signer — `setName` writes
 * `msg.sender`'s own record, and `setAddr` has to target the signer or it
 * points a name at a third party — so this one predicate decides whether a
 * page offers those actions at all.
 *
 * It is a presentational gate; the request builders refuse a non-signer target
 * whatever the UI does (see `useReverseResolutionMutations`). Its job is to
 * keep every surface agreeing on the same answer: a page that renders the
 * table but hides the row actions, or an empty state where an action belongs,
 * is a dead end for the one wallet that can actually use the feature.
 */
export function useIsConnectedAddress(address: Address | undefined): boolean {
  const { address: connectedAddress } = useConnection()

  return (
    !!address && !!connectedAddress && isAddressEqual(connectedAddress, address)
  )
}
