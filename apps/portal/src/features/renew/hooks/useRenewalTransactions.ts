import { transactionManager } from '@ens-apps/transaction-manager'
import { REFERER_ADDRESS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import {
  ethRegistrarControllerRenewSnippet,
  ethRegistrarControllerRentPriceSnippet,
} from '@ensdomains/ensjs/contracts'
import { ethRegistrarRenewSnippet } from '@ensdomains/ensjs-abi/v2/ethRegistrar'
import { getWalletClient } from '@wagmi/core/actions'
import { useState } from 'react'
import { type Address, encodeFunctionData, erc20Abi } from 'viem'
import { readContract } from 'viem/actions'
import { sepolia } from 'viem/chains'
import { useConfig, useConnection, usePublicClient } from 'wagmi'
import { getTokenMetadataWithAddress } from '@/features/register/utils/tokenLookup'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import type { Transaction } from '@/features/transaction-manager/types'
import type { SupportedTokenSymbol } from '@/lib/constants/tokens'
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
  readonly v2TokenAllowance?: bigint
  readonly v2TokenSymbol?: SupportedTokenSymbol
  // V1 (ETH) — price fetched fresh per tx for accuracy
}

export type StartFlowConfig = {
  readonly duration: number
  readonly v2TokenAddress?: Address
  readonly v2TokenPrice?: bigint
  readonly v2TokenAllowance?: bigint
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

type RenewalRuntime = {
  readonly from: Address
  readonly publicClient: NonNullable<ReturnType<typeof usePublicClient>>
  readonly signer: ReturnType<typeof createEOASigner>
}

function buildApproveTransaction(
  params: ApproveParams,
  signer: ReturnType<typeof createEOASigner>,
) {
  const approveData = encodeFunctionData({
    abi: erc20Abi,
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

type RenewalActionHandlers = {
  readonly onApproveStart: () => Promise<void>
  readonly onV2RenewStart: () => Promise<void>
  readonly onV1RenewStart: () => Promise<void>
  readonly onDone: () => void
}

const buildRenewalFlowTransactions = (
  savedParams: SavedRenewalParams | null,
  handlers: RenewalActionHandlers,
  hasSufficientAllowance: boolean,
): Transaction[] => {
  if (!savedParams) return []

  const { name, v2TokenAddress, v2TokenSymbol } = savedParams

  if (name.isV2 && v2TokenAddress) {
    const renewTx: Transaction = {
      id: RENEWAL_TX_IDS.v2Renew(name.name),
      title: `Extend ${name.name}`,
      transactionName: `Extend ${name.name}`,
      estimatedGasCost: 0.001,
      onStart: handlers.onV2RenewStart,
      onDone: handlers.onDone,
    }
    if (hasSufficientAllowance) return [renewTx]
    return [
      {
        id: RENEWAL_TX_IDS.approve,
        title: 'Approve payment',
        transactionName: `Approve ${v2TokenSymbol ?? 'token'} for renewal`,
        estimatedGasCost: 0.0003,
        onStart: handlers.onApproveStart,
        onDone: handlers.onV2RenewStart,
      },
      renewTx,
    ]
  }

  return [
    {
      id: RENEWAL_TX_IDS.v1Renew(name.name),
      title: `Extend ${name.name}`,
      transactionName: `Extend ${name.name} (V1)`,
      estimatedGasCost: 0.001,
      onStart: handlers.onV1RenewStart,
      onDone: handlers.onDone,
    },
  ]
}

type UseRenewalTransactionsOptions = {
  readonly onComplete?: () => void
}

export const useRenewalTransactions = ({
  onComplete,
}: UseRenewalTransactionsOptions = {}) => {
  const config = useConfig()
  const connection = useConnection()
  const publicClient = usePublicClient({ chainId: sepolia.id })
  const { closeModal, clearTransaction } = useTransactionModal()
  const [savedParams, setSavedParams] = useState<SavedRenewalParams | null>(
    null,
  )

  const getRuntime = async (): Promise<RenewalRuntime | null> => {
    if (!connection.address || !publicClient) return null

    const walletClient = await getWalletClient(config, {
      connector: connection.connector,
      account: connection.address,
    })
    if (!walletClient) return null

    return {
      from: connection.address,
      publicClient,
      signer: createEOASigner(walletClient),
    }
  }

  const handleDone = () => {
    closeModal()
    clearTransaction()
    onComplete?.()
  }

  const handleApproveStart = async () => {
    if (!savedParams?.v2TokenAddress || !savedParams.v2TokenPrice) return

    const runtime = await getRuntime()
    if (!runtime) return

    buildApproveTransaction(
      {
        from: runtime.from,
        tokenAddress: savedParams.v2TokenAddress,
        tokenPrice: savedParams.v2TokenPrice,
        tokenSymbol: savedParams.v2TokenSymbol,
        publicClient: runtime.publicClient,
      },
      runtime.signer,
    )
  }

  const handleV2RenewStart = async () => {
    if (!savedParams?.v2TokenAddress) return

    const runtime = await getRuntime()
    if (!runtime) return

    buildV2RenewTransaction(
      {
        name: savedParams.name.name,
        duration: savedParams.duration,
        tokenAddress: savedParams.v2TokenAddress,
        from: runtime.from,
        publicClient: runtime.publicClient,
      },
      runtime.signer,
    )
  }

  const handleV1RenewStart = async () => {
    if (!savedParams) return

    const runtime = await getRuntime()

    if (!runtime) return

    transactionManager.clear()
    await buildV1RenewTransaction(
      {
        name: savedParams.name.name,
        duration: savedParams.duration,
        from: runtime.from,
        publicClient: runtime.publicClient,
      },
      runtime.signer,
    )
  }

  const hasSufficientAllowance =
    savedParams?.v2TokenPrice !== undefined &&
    savedParams.v2TokenAllowance !== undefined &&
    savedParams.v2TokenAllowance >= savedParams.v2TokenPrice

  const transactions = buildRenewalFlowTransactions(
    savedParams,
    {
      onApproveStart: handleApproveStart,
      onV2RenewStart: handleV2RenewStart,
      onV1RenewStart: handleV1RenewStart,
      onDone: handleDone,
    },
    hasSufficientAllowance,
  )

  const startFlow = (name: SelectedName, flowConfig: StartFlowConfig) => {
    const v2TokenSymbol = flowConfig.v2TokenAddress
      ? getTokenMetadataWithAddress(flowConfig.v2TokenAddress).symbol
      : undefined

    setSavedParams({
      name,
      duration: flowConfig.duration,
      v2TokenAddress: flowConfig.v2TokenAddress,
      v2TokenPrice: flowConfig.v2TokenPrice,
      v2TokenAllowance: flowConfig.v2TokenAllowance,
      v2TokenSymbol,
    })
  }

  return { transactions, startFlow }
}
