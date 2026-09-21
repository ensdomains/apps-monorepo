import { type Address, isAddress } from 'viem'
import { getEnsAddress } from 'viem/actions'
import { universalResolverAddress } from '@/lib/constants/universalResolver'

type ResolveAddressOrNameParams = {
  client: Parameters<typeof getEnsAddress>[0]
  nameOrAddress: string
}

/**
 * The address a name-or-address input points at: an address as typed, or a
 * name's ETH address record. A name without that record does not resolve.
 *
 * There is deliberately no fallback to the name's owner. Callers send a name or
 * grant role authority to the result, and the owner isn't who the name points
 * at: whoever registers a name's V2 twin owns it, and a V1 name's registry
 * owner is its controller, not the registrant.
 */
export async function resolveAddressOrName({
  client,
  nameOrAddress,
}: ResolveAddressOrNameParams): Promise<Address | null> {
  if (isAddress(nameOrAddress, { strict: false })) {
    return nameOrAddress as Address
  }

  try {
    return await getEnsAddress(client, {
      name: nameOrAddress,
      universalResolverAddress,
    })
  } catch {
    return null
  }
}
