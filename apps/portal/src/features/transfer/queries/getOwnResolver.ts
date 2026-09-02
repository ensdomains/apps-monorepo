import { permissionedRegistryGetResolverSnippet } from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import { queryOptions } from '@tanstack/react-query'
import { type Address, zeroAddress } from 'viem'
import { readContract } from 'viem/actions'
import { getAction } from 'viem/utils'
import { safeGetClient } from '@/lib/wagmi/helpers'

/**
 * The resolver set on the name's *own* registry slot, or null if it has none.
 *
 * Deliberately not `getResolver` from `@ensdomains/ensjs/public`: that goes
 * through the UniversalResolver and returns the resolver a name *effectively*
 * resolves through, walking up to an ancestor when the name has none of its own.
 * For a 2LD the two nearly always agree, but for a subname the effective
 * resolver is commonly the parent's — and the transfer flow must not treat an
 * inherited resolver as something the sender can detach or write to:
 *
 * - `detachNameResolver` writes `registry.setResolver(label, 0)` on this exact
 *   slot, so offering the option off an inherited resolver produces a no-op
 *   transaction while the name keeps resolving through its parent.
 * - `setEthAddress` would write the name's `addr(60)` onto the *parent's*
 *   resolver, which the sender keeps after the transfer (or, more often, isn't
 *   authorized on — reverting mid-plan, before the token has moved).
 *
 * Reading the same slot the write targets keeps the two in agreement.
 */
export const getOwnResolverQueryOptions = ({
  label,
  registryAddress,
}: {
  label: string
  registryAddress: Address
}) =>
  queryOptions({
    queryKey: ['transfer-own-resolver', registryAddress, label],
    queryFn: async (): Promise<Address | null> => {
      const clientResult = safeGetClient()
      if (clientResult.isErr()) throw clientResult.error

      const readContractAction = getAction(
        clientResult.value,
        readContract,
        'readContract',
      )

      const resolver = await readContractAction({
        address: registryAddress,
        abi: permissionedRegistryGetResolverSnippet,
        functionName: 'getResolver',
        args: [label],
      })

      return resolver === zeroAddress ? null : resolver
    },
  })
