import {
  type Signer,
  transactionManager,
  waitForTransaction,
} from '@ens-apps/transaction-manager'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { verifiableFactoryDeployProxySnippet } from '@ensdomains/ensjs-abi/v2/verifiableFactory'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type Address, encodeFunctionData, type Hash } from 'viem'
import { usePublicClient, useWalletClient } from 'wagmi'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import {
  generateResolverSalt,
  getResolverInitCalldata,
  parseProxyDeployedAddress,
} from '@/features/resolver/utils/permissionedResolver'
import { sepoliaWithEns } from '@/lib/wagmi'
import { pollForIndexerSync } from '@/utils/query/pollForIndexerSync'
import { invalidateResolverQueries } from '../utils/invalidateResolverQueries'

interface DeployPermissionedResolverResult {
  txId: string
  hash: Hash
  resolverAddress: Address
}

interface UseDeployPermissionedResolverParams {
  readonly name: string
}

const deployPermissionedResolver = async ({
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
}): Promise<DeployPermissionedResolverResult> => {
  const permissionedResolverImpl = getChainContractAddress({
    chain: sepoliaWithEns,
    contract: 'ensPermissionedResolverImpl',
  })
  const verifiableFactory = getChainContractAddress({
    chain: sepoliaWithEns,
    contract: 'ensVerifiableFactory',
  })

  const salt = generateResolverSalt(name)
  const initCalldata = getResolverInitCalldata(accountAddress)
  const deployCalldata = encodeFunctionData({
    abi: verifiableFactoryDeployProxySnippet,
    functionName: 'deployProxy',
    args: [permissionedResolverImpl, salt, initCalldata],
  })

  const txId = transactionManager.startTransaction(
    {
      type: 'custom',
      request: {
        type: 'eoa',
        from: accountAddress,
        to: verifiableFactory,
        data: deployCalldata,
        value: 0n,
        chainId,
      },
    },
    signer,
    {
      id,
      description: `Deploy permissioned resolver for ${name}`,
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

export const useDeployPermissionedResolver = ({
  name,
}: UseDeployPermissionedResolverParams) => {
  const chainId = sepoliaWithEns.id
  const queryClient = useQueryClient()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()

  const mutation = useMutation({
    mutationFn: async ({
      id,
    }: {
      id: string
    }): Promise<DeployPermissionedResolverResult> => {
      if (!walletClient || !publicClient) {
        throw new Error('Wallet not connected')
      }

      if (!walletClient.account) {
        throw new Error('No account connected')
      }

      const signer = createEOASigner(walletClient)

      return deployPermissionedResolver({
        name,
        signer,
        publicClient,
        accountAddress: walletClient.account.address,
        chainId,
        id,
      })
    },
    onSuccess: () => {
      invalidateResolverQueries(queryClient)
      pollForIndexerSync({
        invalidateQueries: () => invalidateResolverQueries(queryClient),
      })
    },
  })

  return {
    deployPermissionedResolver: mutation.mutate,
    deployPermissionedResolverAsync: mutation.mutateAsync,
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
