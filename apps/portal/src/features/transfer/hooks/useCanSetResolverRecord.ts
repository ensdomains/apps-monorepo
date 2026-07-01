import { useQuery } from '@tanstack/react-query'
import {
  type Address,
  encodeFunctionData,
  namehash,
  parseAbi,
  zeroAddress,
} from 'viem'
import { estimateGas } from 'viem/actions'
import { wagmiConfig } from '@/lib/wagmi'

// Public client for the read-only gas estimation.
const client = wagmiConfig.getClient()

const setAddrSnippet = parseAbi([
  'function setAddr(bytes32 node, uint256 coinType, bytes a)',
])

/**
 * Probe whether `account` can set the ETH address record on `resolverAddress`
 * for `name`, by gas-estimating a `setAddr` from that account. A revert
 * (e.g. `EACUnauthorizedAccountRoles`) means no permission → `false`.
 *
 * Mirrors the check the records editor used, scoped to the transfer flow: the
 * sender owns the name but may not control its resolver (records live on a
 * separate contract), so "set default address" needs this gate to avoid a
 * cryptic revert at signing time.
 */
const canSetResolverRecord = async ({
  name,
  resolverAddress,
  account,
}: {
  name: string
  resolverAddress: Address
  account: Address
}): Promise<boolean> => {
  try {
    const data = encodeFunctionData({
      abi: setAddrSnippet,
      functionName: 'setAddr',
      // coinType 60 = ETH; the value is irrelevant to the permission check.
      args: [namehash(name), 60n, zeroAddress],
    })
    const gas = await estimateGas(client, {
      to: resolverAddress,
      account,
      data,
    })
    return gas > 0n
  } catch {
    return false
  }
}

export const useCanSetResolverRecord = ({
  name,
  resolverAddress,
  account,
}: {
  name: string
  resolverAddress: Address | undefined
  account: Address
}) =>
  useQuery({
    queryKey: ['can-set-resolver-record', name, resolverAddress, account],
    queryFn: () =>
      resolverAddress
        ? canSetResolverRecord({ name, resolverAddress, account })
        : Promise.resolve(false),
    enabled: !!resolverAddress,
  })
