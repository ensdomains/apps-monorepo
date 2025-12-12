import type { Signer } from '@ens-apps/transaction-manager'
import {
  ENS_SEPOLIA_CONTRACTS,
  type TransactionRequest,
  transactionManager,
} from '@ens-apps/transaction-manager'
import type { Address, Hex, PublicClient } from 'viem'
import { encodeFunctionData } from 'viem'
import { customSepolia } from '@/lib/wagmi'
import { HCA_FACTORY_ABI } from '../hca-factory.abi'
import type { SmartAccountProvider } from './types'

export async function registerHCAOwnership(params: {
  smartAccountAddress: Address
  eoaAddress: Address
  signer: Signer
  publicClient: PublicClient
}): Promise<`0x${string}`> {
  const { smartAccountAddress, eoaAddress, signer, publicClient } = params

  console.log('🔐 Registering HCA ownership via smart account (sponsored):', {
    smartAccount: smartAccountAddress,
    eoaOwner: eoaAddress,
    hcaFactory: ENS_SEPOLIA_CONTRACTS.HCAFactory,
    signerType: signer.type,
  })

  const currentOwner = await publicClient.readContract({
    address: ENS_SEPOLIA_CONTRACTS.HCAFactory,
    abi: HCA_FACTORY_ABI,
    functionName: 'getAccountOwner',
    args: [smartAccountAddress],
  })

  if (currentOwner.toLowerCase() === eoaAddress.toLowerCase()) {
    console.log('✅ HCA ownership already registered')
    return '0x0' as `0x${string}`
  }

  if (currentOwner !== '0x0000000000000000000000000000000000000000') {
    console.warn(
      '⚠️ HCA already has a different owner registered:',
      currentOwner,
    )
    return '0x0' as `0x${string}`
  }

  const data = encodeFunctionData({
    abi: HCA_FACTORY_ABI,
    functionName: 'setAccountOwner',
    args: [smartAccountAddress, eoaAddress],
  }) as Hex

  const calls = [
    {
      to: ENS_SEPOLIA_CONTRACTS.HCAFactory,
      data,
      value: 0n,
    },
  ]

  const request: TransactionRequest =
    signer.type === 'pimlico'
      ? ({
          type: 'pimlico',
          from: smartAccountAddress,
          to: ENS_SEPOLIA_CONTRACTS.HCAFactory,
          data,
          value: 0n,
          chainId: customSepolia.id,
          pimlicoParams: {
            calls,
            sponsored: true,
          },
        } as TransactionRequest)
      : ({
          type: 'rhinestone-intent',
          from: smartAccountAddress,
          to: ENS_SEPOLIA_CONTRACTS.HCAFactory,
          data,
          value: 0n,
          chainId: customSepolia.id,
          rhinestoneParams: {
            calls,
            sponsored: true,
          },
        } as TransactionRequest)

  const txId = transactionManager.startTransaction(
    {
      type: 'custom',
      request,
    },
    signer,
    {
      description: 'Register HCA ownership',
      publicClient,
    },
  )

  console.log(
    '✅ HCA ownership registration transaction submitted (sponsored), txId:',
    txId,
  )

  const txActor = transactionManager.getTransaction(txId)
  if (txActor) {
    const subscription = txActor.subscribe((snapshot) => {
      if (snapshot.value === 'success') {
        const context = snapshot.context
        const hash = context?.hash || context?.receipt?.transactionHash
        if (hash) {
          console.log('✅ HCA ownership registration transaction hash:', hash)
        }
        subscription.unsubscribe()
      } else if (
        typeof snapshot.value === 'object' &&
        snapshot.value !== null &&
        'error' in snapshot.value
      ) {
        const errorContext = snapshot.context
        console.error(
          '❌ HCA ownership registration transaction failed:',
          errorContext?.error,
        )
        subscription.unsubscribe()
      }
    })
  }

  return txId as `0x${string}`
}

export async function getHCAOwner(params: {
  smartAccountAddress: Address
  publicClient: PublicClient
}): Promise<Address> {
  const { smartAccountAddress, publicClient } = params

  const owner = await publicClient.readContract({
    address: ENS_SEPOLIA_CONTRACTS.HCAFactory,
    abi: HCA_FACTORY_ABI,
    functionName: 'getAccountOwner',
    args: [smartAccountAddress],
  })

  return owner
}

export async function registerHCAOwnershipSafe(params: {
  smartAccountAddress: Address
  eoaAddress: Address
  signer: Signer
  publicClient: PublicClient
  accountType?: SmartAccountProvider
}): Promise<void> {
  const { accountType = 'pimlico' } = params

  try {
    console.log(
      `🔐 Registering HCA ownership for ${accountType} account (sponsored)...`,
    )
    await registerHCAOwnership({
      smartAccountAddress: params.smartAccountAddress,
      eoaAddress: params.eoaAddress,
      signer: params.signer,
      publicClient: params.publicClient,
    })
    console.log(
      '✅ HCA ownership registration submitted successfully (sponsored)',
    )
  } catch (error) {
    console.error('⚠️ Failed to register HCA ownership:', error)
  }
}
