import { transactionManager } from '@ens-apps/transaction-manager'
import { ERC20_ABI } from '@ens-apps/transaction-manager/contracts/abis/ERC20.abi'
import { REFERER_ADDRESS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import {
  ethRegistrarControllerRenewSnippet,
  ethRegistrarControllerRentPriceSnippet,
} from '@ensdomains/ensjs/contracts'
import { ethRegistrarRenewSnippet } from '@ensdomains/ensjs-abi/v2/ethRegistrar'
import { getWalletClient } from '@wagmi/core/actions'
import { useState } from 'react'
import { type Address, encodeFunctionData } from 'viem'
import { readContract } from 'viem/actions'
import { sepolia } from 'viem/chains'
import { useConfig, useConnection, usePublicClient } from 'wagmi'
import { getTokenMetadataWithAddress } from '@/features/register/utils/tokenLookup'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import type { Transaction } from '@/features/transaction-manager/types'
import { sepoliaWithEns } from '@/lib/wagmi'

export type SelectedName = {
  readonly name: string
  readonly isV2: boolean
  readonly expiryDate?: Date | null
}

export const RENEWAL_TX_IDS = {
  approve: 'renewal-approve',
  v1Renew: (name: string) => `renewal-v1-renew-${name}`,
  v2Renew: (name: string) => `renewal-v2-renew-${name}`,
} as const

const ethRegistrar = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensEthRegistrar',
})

const ethRegistrarController = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensEthRegistrarController',
})

type SavedRenewalParams = {
  readonly name: SelectedName
  readonly duration: number
  // V2 (ERC20)
  readonly v2TokenAddress?: Address
  readonly v2TokenPrice?: bigint
  readonly v2TokenSymbol?: 'USDC' | 'DAI'
  // V1 (ETH) — price fetched fresh per tx for accuracy
}

export type StartFlowConfig = {
  readonly duration: number
  readonly v2TokenAddress?: Address
  readonly v2TokenPrice?: bigint
}

type ApproveParams = {
  readonly from: Address
  readonly tokenAddress: Address
  readonly tokenPrice: bigint
  readonly tokenSymbol: string | undefined
  readonly publicClient: NonNullable<ReturnType<typeof usePublicClient>>
}

type V2RenewParams = {
  readonly name: string
  readonly duration: number
  readonly tokenAddress: Address
  readonly from: Address
  readonly publicClient: NonNullable<ReturnType<typeof usePublicClient>>
}

type V1RenewParams = {
  readonly name: string
  readonly duration: number
  readonly from: Address
  readonly publicClient: NonNullable<ReturnType<typeof usePublicClient>>
}

function buildApproveTransaction(
  params: ApproveParams,
  signer: ReturnType<typeof createEOASigner>,
) {
  const approveData = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [ethRegistrar, params.tokenPrice * 2n],
  })

  transactionManager.clear()

  transactionManager.startTransaction(
    {
      type: 'custom',
      request: {
        type: 'eoa',
        from: params.from,
        to: params.tokenAddress,
        data: approveData,
        value: 0n,
        chainId: sepolia.id,
      },
    },
    signer,
    {
      id: RENEWAL_TX_IDS.approve,
      publicClient: params.publicClient,
      description: `Approve ${params.tokenSymbol} for renewal`,
    },
  )
}

function buildV2RenewTransaction(
  params: V2RenewParams,
  signer: ReturnType<typeof createEOASigner>,
) {
  const label = params.name.replace('.eth', '')
  const renewData = encodeFunctionData({
    abi: ethRegistrarRenewSnippet,
    functionName: 'renew',
    args: [
      label,
      BigInt(params.duration),
      params.tokenAddress,
      REFERER_ADDRESS,
    ],
  })

  transactionManager.startTransaction(
    {
      type: 'custom',
      request: {
        type: 'eoa',
        from: params.from,
        to: ethRegistrar,
        data: renewData,
        value: 0n,
        chainId: sepolia.id,
      },
    },
    signer,
    {
      id: RENEWAL_TX_IDS.v2Renew(params.name),
      publicClient: params.publicClient,
      description: `Renew ${params.name}`,
    },
  )
}

async function buildV1RenewTransaction(
  params: V1RenewParams,
  signer: ReturnType<typeof createEOASigner>,
) {
  const label = params.name.replace('.eth', '')
  const priceResult = await readContract(params.publicClient, {
    address: ethRegistrarController,
    abi: ethRegistrarControllerRentPriceSnippet,
    functionName: 'rentPrice',
    args: [label, BigInt(params.duration)],
  })
  const rawPrice = priceResult.base + priceResult.premium
  const bufferedPrice = (rawPrice * 102n) / 100n

  const renewData = encodeFunctionData({
    abi: ethRegistrarControllerRenewSnippet,
    functionName: 'renew',
    args: [label, BigInt(params.duration)],
  })

  transactionManager.startTransaction(
    {
      type: 'custom',
      request: {
        type: 'eoa',
        from: params.from,
        to: ethRegistrarController,
        data: renewData,
        value: bufferedPrice,
        chainId: sepolia.id,
      },
    },
    signer,
    {
      id: RENEWAL_TX_IDS.v1Renew(params.name),
      publicClient: params.publicClient,
      description: `Renew ${params.name}`,
    },
  )
}

export const useRenewalTransactions = () => {
  const config = useConfig()
  const connection = useConnection()
  const publicClient = usePublicClient({ chainId: sepolia.id })
  const { closeModal, clearTransaction } = useTransactionModal()
  const [savedParams, setSavedParams] = useState<SavedRenewalParams | null>(
    null,
  )

  const getWallet = async () => {
    if (!connection.address) throw new Error('No connected account')
    const walletClient = await getWalletClient(config, {
      connector: connection.connector,
      account: connection.address,
    })
    if (!walletClient) throw new Error('Failed to get wallet client')
    return walletClient
  }

  const handleDone = () => {
    closeModal()
    clearTransaction()
  }

  const handleApproveStart = async () => {
    if (
      !savedParams?.v2TokenAddress ||
      !savedParams.v2TokenPrice ||
      !connection.address ||
      !publicClient
    )
      return

    const walletClient = await getWallet()
    const signer = createEOASigner(walletClient)

    buildApproveTransaction(
      {
        from: connection.address,
        tokenAddress: savedParams.v2TokenAddress,
        tokenPrice: savedParams.v2TokenPrice,
        tokenSymbol: savedParams.v2TokenSymbol,
        publicClient,
      },
      signer,
    )
  }

  const handleV2RenewStart = async () => {
    if (!savedParams?.v2TokenAddress || !connection.address || !publicClient)
      return

    const walletClient = await getWallet()
    const signer = createEOASigner(walletClient)

    buildV2RenewTransaction(
      {
        name: savedParams.name.name,
        duration: savedParams.duration,
        tokenAddress: savedParams.v2TokenAddress,
        from: connection.address,
        publicClient,
      },
      signer,
    )
  }

  const handleV1RenewStart = async () => {
    if (!connection.address || !publicClient) return

    const walletClient = await getWallet()
    const signer = createEOASigner(walletClient)

    transactionManager.clear()
    await buildV1RenewTransaction(
      {
        name: savedParams?.name.name ?? '',
        duration: savedParams?.duration ?? 0,
        from: connection.address,
        publicClient,
      },
      signer,
    )
  }

  const transactions: Transaction[] = (() => {
    if (!savedParams) return []

    const { name, v2TokenAddress, v2TokenSymbol } = savedParams

    if (name.isV2 && v2TokenAddress) {
      return [
        {
          id: RENEWAL_TX_IDS.approve,
          title: 'Approve payment',
          transactionName: `Approve ${v2TokenSymbol ?? 'token'} for renewal`,
          estimatedGasCost: 0.0003,
          onStart: handleApproveStart,
          onDone: handleV2RenewStart,
        },
        {
          id: RENEWAL_TX_IDS.v2Renew(name.name),
          title: `Extend ${name.name}`,
          transactionName: `Extend ${name.name}`,
          estimatedGasCost: 0.001,
          onStart: handleV2RenewStart,
          onDone: handleDone,
        },
      ]
    }

    return [
      {
        id: RENEWAL_TX_IDS.v1Renew(name.name),
        title: `Extend ${name.name}`,
        transactionName: `Extend ${name.name} (V1)`,
        estimatedGasCost: 0.001,
        onStart: handleV1RenewStart,
        onDone: handleDone,
      },
    ]
  })()

  const startFlow = (name: SelectedName, flowConfig: StartFlowConfig) => {
    const v2TokenSymbol = flowConfig.v2TokenAddress
      ? getTokenMetadataWithAddress(flowConfig.v2TokenAddress).symbol
      : undefined

    setSavedParams({
      name,
      duration: flowConfig.duration,
      v2TokenAddress: flowConfig.v2TokenAddress,
      v2TokenPrice: flowConfig.v2TokenPrice,
      v2TokenSymbol,
    })
  }

  return { transactions, startFlow }
}
