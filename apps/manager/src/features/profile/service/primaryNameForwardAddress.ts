import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { queryOptions } from '@tanstack/react-query'
import {
  type Address,
  BaseError,
  ContractFunctionRevertedError,
  isAddressEqual,
  type PublicClient,
  zeroAddress,
} from 'viem'
import { getEnsAddress } from 'viem/actions'
import { requireCanonicalPrimaryName } from './profileName'

export const getPrimaryNameForwardAddress = async (
  publicClient: PublicClient,
  name: string,
): Promise<Address | null> => {
  const canonicalName = requireCanonicalPrimaryName(name)
  try {
    return await getEnsAddress(publicClient, {
      name: canonicalName,
      coinType: 60n,
      strict: true,
    })
  } catch (error) {
    // An unset or unsupported resolver record can be configured by its owner.
    // Keep transport, gateway, and other resolver failures as errors so they
    // cannot be mistaken for permission to overwrite an existing record.
    const cause =
      error instanceof BaseError
        ? error.walk((entry) => entry instanceof ContractFunctionRevertedError)
        : undefined
    if (cause instanceof ContractFunctionRevertedError) {
      const { errorName, args } = cause.data ?? {}
      if (
        errorName === 'ResolverNotFound' ||
        errorName === 'ResolverNotContract' ||
        errorName === 'UnsupportedResolverProfile' ||
        (errorName === 'ResolverError' && args?.[0] === '0x')
      )
        return null
    }
    throw error
  }
}

export const primaryNameForwardAddressQuery = (
  publicClient: PublicClient,
  name: string,
) =>
  queryOptions({
    queryKey: qk('profile', 'primary_name_forward_address', {
      name,
      chainId: publicClient.chain?.id,
    }),
    queryFn: () => getPrimaryNameForwardAddress(publicClient, name),
  })

export const hasPrimaryNameForwardAddress = (
  resolvedAddress: Address | null | undefined,
  ownerAddress: Address | null | undefined,
): boolean =>
  Boolean(
    resolvedAddress &&
      ownerAddress &&
      !isAddressEqual(resolvedAddress, zeroAddress) &&
      isAddressEqual(resolvedAddress, ownerAddress),
  )

/** Read through the Universal Resolver afresh, without an indexer resolver hint. */
export async function assertPrimaryNameForwardResolution(
  publicClient: PublicClient,
  name: string,
  ownerAddress: Address,
): Promise<void> {
  const resolvedAddress = await getPrimaryNameForwardAddress(publicClient, name)
  if (!hasPrimaryNameForwardAddress(resolvedAddress, ownerAddress)) {
    throw new Error(
      'Cannot set primary name - the name does not resolve to the owner address.',
    )
  }
}
