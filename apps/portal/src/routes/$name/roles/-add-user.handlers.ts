import { type Address, isAddress } from 'viem'
import { getEnsAddress } from 'viem/actions'
import { getEnsOwner } from '@/features/profile/hooks/useEnsOwner'

type ResolveAddressOrNameParams = {
  client: Parameters<typeof getEnsAddress>[0]
  nameOrAddress: string
  requestId: number
}

type ResolveAddressOrNameResult = {
  address: Address | null
  requestId: number
}

export async function resolveAddressOrName({
  client,
  nameOrAddress,
  requestId,
}: ResolveAddressOrNameParams): Promise<ResolveAddressOrNameResult> {
  if (isAddress(nameOrAddress, { strict: false })) {
    return { address: nameOrAddress as Address, requestId }
  }

  try {
    const resolved = await getEnsAddress(client, {
      name: nameOrAddress,
      universalResolverAddress: '0x50168842c0f5c9992a34085d9a6dc5b0a4f306ce',
    })

    let resolvedAddress = resolved

    // Fallback for names that do not set an address record:
    // use current ENS owner address so the role can still be granted.
    if (!resolvedAddress) {
      const ownerResult = await getEnsOwner({ name: nameOrAddress })
      if (ownerResult.isOk()) {
        resolvedAddress = ownerResult.value?.owner ?? null
      }
    }

    return { address: resolvedAddress, requestId }
  } catch {
    return { address: null, requestId }
  }
}
