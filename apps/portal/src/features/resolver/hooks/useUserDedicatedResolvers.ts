import { useQuery } from '@tanstack/react-query'
import { type Address, parseAbiItem } from 'viem'
import { usePublicClient } from 'wagmi'
import { namechainVerifiableFactory } from '@/lib/constants/verifiableFactory'
import { namechainSepolia } from '@/lib/wagmi'

const proxyDeployedEvent = parseAbiItem(
  'event ProxyDeployed(address indexed sender, address indexed proxyAddress, uint256 salt, address implementation)',
)

interface UseUserDedicatedResolversParams {
  readonly senderAddress?: Address
}

export const useUserDedicatedResolvers = ({
  senderAddress,
}: UseUserDedicatedResolversParams) => {
  const publicClient = usePublicClient({ chainId: namechainSepolia.id })

  return useQuery({
    queryKey: ['user-dedicated-resolvers', senderAddress],
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

      const addresses: Address[] = []
      const seen = new Set<string>()

      for (const log of [...logs].reverse()) {
        const implementationAddress = log.args.implementation as
          | Address
          | undefined
        if (
          !implementationAddress ||
          implementationAddress.toLowerCase() !==
            namechainSepolia.contracts.ensDedicatedResolver.address.toLowerCase()
        ) {
          continue
        }

        const proxyAddress = log.args.proxyAddress as Address | undefined
        if (!proxyAddress) continue

        const normalized = proxyAddress.toLowerCase()
        if (seen.has(normalized)) continue

        seen.add(normalized)
        addresses.push(proxyAddress)
      }

      return addresses
    },
  })
}
