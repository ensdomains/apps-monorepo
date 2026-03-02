import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { useQuery } from '@tanstack/react-query'
import { type Address, parseAbiItem } from 'viem'
import { usePublicClient } from 'wagmi'
import {
  filterDedicatedResolverAddresses,
  type ProxyDeployedLog,
} from '@/features/resolver/utils/dedicatedResolver'
import { namechainVerifiableFactory } from '@/lib/constants/verifiableFactory'
import { namechainSepolia } from '@/lib/wagmi'

const proxyDeployedEvent = parseAbiItem(
  'event ProxyDeployed(address indexed sender, address indexed proxyAddress, uint256 salt, address implementation)',
)

interface UseUserDedicatedResolversParams {
  readonly senderAddress?: Address
}

const userDedicatedResolversQueryKey = createQueryKey<
  'user-dedicated-resolvers',
  { senderAddress?: Address }
>('user-dedicated-resolvers')

export const useUserDedicatedResolvers = ({
  senderAddress,
}: UseUserDedicatedResolversParams) => {
  const publicClient = usePublicClient({ chainId: namechainSepolia.id })

  return useQuery({
    queryKey: userDedicatedResolversQueryKey({ senderAddress }),
    enabled: !!senderAddress && !!publicClient,
    queryFn: async () => {
      if (!publicClient || !senderAddress) return []

      const logs = await publicClient.getLogs({
        address: namechainVerifiableFactory,
        event: proxyDeployedEvent,
        args: {
          sender: senderAddress,
        },
        fromBlock: 0n,
        toBlock: 'latest',
      })

      return filterDedicatedResolverAddresses(
        logs as ProxyDeployedLog[],
        namechainSepolia.contracts.ensDedicatedResolver.address,
      )
    },
  })
}
