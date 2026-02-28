import {
  type Signer,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import { useMutation } from '@tanstack/react-query'
import {
  type Address,
  decodeEventLog,
  encodeFunctionData,
  type Hash,
  type Hex,
  keccak256,
  parseAbi,
  stringToBytes,
} from 'viem'
import { usePublicClient, useWalletClient } from 'wagmi'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import { namechainVerifiableFactory } from '@/lib/constants/verifiableFactory'
import { namechainSepolia } from '@/lib/wagmi'

const verifiableFactoryAbi = parseAbi([
  'function deployProxy(address implementation, uint256 salt, bytes data)',
  'event ProxyDeployed(address indexed sender, address indexed proxyAddress, uint256 salt, address implementation)',
])

const dedicatedResolverInitAbi = parseAbi([
  'function initialize(address owner, uint256 bitmap)',
])

const dedicatedResolverRoleBitmap = BigInt(
  '0x1111111111111111111111111111111111111111111111111111111111111111',
)

interface DeployDedicatedResolverResult {
  txId: string
  hash: Hash
  resolverAddress: Address
}

interface UseDeployDedicatedResolverParams {
  readonly name: string
}

const generateResolverSalt = (name: string) => {
  const timestamp = new Date().toISOString()
  return BigInt(keccak256(stringToBytes(`${name}:${timestamp}`)))
}

const getResolverInitCalldata = (ownerAddress: Address): Hex => {
  return encodeFunctionData({
    abi: dedicatedResolverInitAbi,
    functionName: 'initialize',
    args: [ownerAddress, dedicatedResolverRoleBitmap],
  })
}

const parseProxyDeployedAddress = (
  logs: readonly { topics: readonly Hex[]; data: Hex }[],
): Address | null => {
  for (const log of logs) {
    if (log.topics.length === 0) continue

    try {
      const decoded = decodeEventLog({
        abi: verifiableFactoryAbi,
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      })

      if (decoded.eventName === 'ProxyDeployed') {
        return decoded.args.proxyAddress as Address
      }
    } catch {
      // Ignore logs that don't match ProxyDeployed
    }
  }

  return null
}

const deployDedicatedResolver = async ({
  name,
  signer,
  publicClient,
  accountAddress,
  chainId,
}: {
  name: string
  signer: Signer
  publicClient: NonNullable<ReturnType<typeof usePublicClient>>
  accountAddress: Address
  chainId: number
}): Promise<DeployDedicatedResolverResult> => {
  const salt = generateResolverSalt(name)
  const initCalldata = getResolverInitCalldata(accountAddress)
  const deployCalldata = encodeFunctionData({
    abi: verifiableFactoryAbi,
    functionName: 'deployProxy',
    args: [
      namechainSepolia.contracts.ensDedicatedResolver.address,
      salt,
      initCalldata,
    ],
  })

  const txId = transactionManager.startTransaction(
    {
      type: 'custom',
      request: {
        type: 'eoa',
        from: accountAddress,
        to: namechainVerifiableFactory,
        data: deployCalldata,
        value: 0n,
        chainId,
      },
    },
    signer,
    {
      description: `Deploy dedicated resolver for ${name}`,
      publicClient,
      timeout: 120_000,
    },
  )

  const result = await waitForTransaction(txId)
  const resolverAddress = parseProxyDeployedAddress(result.receipt?.logs ?? [])

  if (!resolverAddress) {
    throw new Error('Could not extract deployed resolver address from receipt')
  }

  return {
    txId,
    hash: result.hash,
    resolverAddress,
  }
}

export const useDeployDedicatedResolver = ({
  name,
}: UseDeployDedicatedResolverParams) => {
  const chainId = namechainSepolia.id
  const { data: walletClient } = useWalletClient({ chainId })
  const publicClient = usePublicClient({ chainId })

  const mutation = useMutation({
    mutationFn: async (): Promise<DeployDedicatedResolverResult> => {
      if (!walletClient || !publicClient) {
        throw new Error('Wallet not connected')
      }

      if (!walletClient.account) {
        throw new Error('No account connected')
      }

      const signer = createEOASigner(walletClient)

      return deployDedicatedResolver({
        name,
        signer,
        publicClient,
        accountAddress: walletClient.account.address,
        chainId,
      })
    },
  })

  return {
    deployDedicatedResolver: mutation.mutate,
    deployDedicatedResolverAsync: mutation.mutateAsync,
    txHash: mutation.data?.hash,
    deployedResolverAddress: mutation.data?.resolverAddress,
    isWriting: mutation.isPending,
    isConfirming: mutation.isPending,
    isConfirmed: mutation.isSuccess,
    error: mutation.error,
    reset: mutation.reset,
    hasWallet: !!walletClient,
  }
}
