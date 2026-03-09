import {
  type Signer,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import { useMutation } from '@tanstack/react-query'
import { type Address, encodeFunctionData, type Hash, parseAbi } from 'viem'
import { usePublicClient, useWalletClient } from 'wagmi'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import {
  generateResolverSalt,
  getResolverInitCalldata,
  parseProxyDeployedAddress,
} from '@/features/resolver/utils/dedicatedResolver'
import { namechainVerifiableFactory } from '@/lib/constants/verifiableFactory'
import { namechainSepolia } from '@/lib/wagmi'

const verifiableFactoryAbi = parseAbi([
  'function deployProxy(address implementation, uint256 salt, bytes data)',
  'event ProxyDeployed(address indexed sender, address indexed proxyAddress, uint256 salt, address implementation)',
])

interface DeployDedicatedResolverResult {
  txId: string
  hash: Hash
  resolverAddress: Address
}

interface UseDeployDedicatedResolverParams {
  readonly name: string
}

const deployDedicatedResolver = async ({
  name,
  signer,
  publicClient,
  accountAddress,
  chainId,
  id,
}: {
  name: string
  signer: Signer
  publicClient: NonNullable<ReturnType<typeof usePublicClient>>
  accountAddress: Address
  chainId: number
  id: string
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
      id,
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
    mutationFn: async ({
      id,
    }: {
      id: string
    }): Promise<DeployDedicatedResolverResult> => {
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
        id,
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
    hasWallet: Boolean(walletClient?.account),
  }
}
