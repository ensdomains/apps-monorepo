import { transactionManager } from '@ens-apps/transaction-manager'
import { ERC20_ABI } from '@ens-apps/transaction-manager/contracts/abis/ERC20.abi'
import { FAST_TEST_ETH_REGISTRAR_ABI } from '@ens-apps/transaction-manager/contracts/abis/FastTestETHRegistrar.abi'
import {
  ENS_SEPOLIA_CONTRACTS,
  REFERER_ADDRESS,
} from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { getWalletClient } from '@wagmi/core/actions'
import { useCallback, useMemo, useState } from 'react'
import { type Address, encodeFunctionData } from 'viem'
import { sepolia } from 'viem/chains'
import { useConfig, useConnection, usePublicClient } from 'wagmi'
import { getTokenMetadataWithAddress } from '@/features/register/utils/tokenLookup'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import type { Transaction } from '@/features/transaction-manager/types'

export type SelectedName = {
  readonly name: string
  readonly isV2: boolean
  readonly expiryDate?: Date | null
}

export const RENEWAL_TX_IDS = {
  approve: 'renewal-approve',
  renew: (name: string) => `renewal-renew-${name}`,
} as const

type SavedRenewalParams = {
  readonly name: SelectedName
  readonly duration: number
  readonly tokenAddress: Address
  readonly tokenPrice: bigint
  readonly tokenSymbol: 'USDC' | 'DAI'
}

type MultiSavedRenewalParams = {
  readonly names: SelectedName[]
  readonly duration: number
  readonly tokenAddress: Address
  readonly tokenPrice: bigint
  readonly tokenSymbol: 'USDC' | 'DAI'
}

export type StartFlowConfig = {
  readonly duration: number
  readonly tokenAddress: Address
  readonly tokenPrice: bigint
}

export type StartMultiFlowConfig = {
  readonly duration: number
  readonly tokenAddress: Address
  readonly tokenPrice: bigint
}

type ApproveParams = {
  readonly from: Address
  readonly tokenAddress: Address
  readonly tokenPrice: bigint
  readonly tokenSymbol: string | undefined
  readonly publicClient: NonNullable<ReturnType<typeof usePublicClient>>
}

type RenewParams = {
  readonly name: string
  readonly duration: number
  readonly tokenAddress: Address
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
    args: [ENS_SEPOLIA_CONTRACTS.ETHRegistrar, params.tokenPrice * 2n],
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

function buildRenewTransaction(
  params: RenewParams,
  signer: ReturnType<typeof createEOASigner>,
) {
  const label = params.name.replace('.eth', '')
  const renewData = encodeFunctionData({
    abi: FAST_TEST_ETH_REGISTRAR_ABI,
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
        to: ENS_SEPOLIA_CONTRACTS.ETHRegistrar,
        data: renewData,
        value: 0n,
        chainId: sepolia.id,
      },
    },
    signer,
    {
      id: RENEWAL_TX_IDS.renew(params.name),
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
  const [multiSavedParams, setMultiSavedParams] =
    useState<MultiSavedRenewalParams | null>(null)

  const getWallet = useCallback(async () => {
    if (!connection.address) throw new Error('No connected account')
    const walletClient = await getWalletClient(config, {
      connector: connection.connector,
      account: connection.address,
    })
    if (!walletClient) throw new Error('Failed to get wallet client')
    return walletClient
  }, [config, connection])

  const handleDone = useCallback(() => {
    closeModal()
    clearTransaction()
  }, [closeModal, clearTransaction])

  const handleApproveStart = useCallback(async () => {
    if (
      !savedParams?.tokenAddress ||
      !savedParams.tokenPrice ||
      !connection.address ||
      !publicClient
    )
      return

    const walletClient = await getWallet()
    const signer = createEOASigner(walletClient)

    buildApproveTransaction(
      {
        from: connection.address,
        tokenAddress: savedParams.tokenAddress,
        tokenPrice: savedParams.tokenPrice,
        tokenSymbol: savedParams.tokenSymbol,
        publicClient,
      },
      signer,
    )
  }, [savedParams, connection, getWallet, publicClient])

  const handleRenewStart = useCallback(async () => {
    if (!savedParams?.tokenAddress || !connection.address || !publicClient)
      return

    const walletClient = await getWallet()
    const signer = createEOASigner(walletClient)

    buildRenewTransaction(
      {
        name: savedParams.name.name,
        duration: savedParams.duration,
        tokenAddress: savedParams.tokenAddress,
        from: connection.address,
        publicClient,
      },
      signer,
    )
  }, [savedParams, connection, getWallet, publicClient])

  const transactions: Transaction[] = useMemo(() => {
    if (!savedParams) return []

    const { name, tokenSymbol } = savedParams

    return [
      {
        id: RENEWAL_TX_IDS.approve,
        title: 'Approve payment',
        transactionName: `Approve ${tokenSymbol} for renewal`,
        estimatedGasCost: 0.0003,
        onStart: handleApproveStart,
        onDone: handleRenewStart,
      },
      {
        id: RENEWAL_TX_IDS.renew(name.name),
        title: `Extend ${name.name}`,
        transactionName: `Extend ${name.name}`,
        estimatedGasCost: 0.001,
        onStart: handleRenewStart,
        onDone: handleDone,
      },
    ]
  }, [savedParams, handleApproveStart, handleRenewStart, handleDone])

  const multiTransactions: Transaction[] = useMemo(() => {
    if (!multiSavedParams || !connection.address || !publicClient) return []

    const from = connection.address
    const client = publicClient
    const { names, duration, tokenAddress, tokenSymbol, tokenPrice } =
      multiSavedParams

    const makeRenewFn = (name: SelectedName) => async () => {
      const walletClient = await getWallet()
      const signer = createEOASigner(walletClient)
      buildRenewTransaction(
        { name: name.name, duration, tokenAddress, from, publicClient: client },
        signer,
      )
    }

    const renewFns = names.map(makeRenewFn)

    const approveTx: Transaction = {
      id: RENEWAL_TX_IDS.approve,
      title: 'Approve payment',
      transactionName: `Approve ${tokenSymbol} for renewal`,
      estimatedGasCost: 0.0003,
      onStart: async () => {
        const walletClient = await getWallet()
        const signer = createEOASigner(walletClient)
        buildApproveTransaction(
          { from, tokenAddress, tokenPrice, tokenSymbol, publicClient: client },
          signer,
        )
      },
      onDone: renewFns[0],
    }

    const renewTxs: Transaction[] = names.map((name, i) => ({
      id: RENEWAL_TX_IDS.renew(name.name),
      title: `Extend ${name.name}`,
      transactionName: `Extend ${name.name}`,
      estimatedGasCost: 0.001,
      onStart: renewFns[i],
      onDone: i < names.length - 1 ? renewFns[i + 1] : handleDone,
    }))

    return [approveTx, ...renewTxs]
  }, [
    multiSavedParams,
    connection.address,
    publicClient,
    getWallet,
    handleDone,
  ])

  const startFlow = useCallback(
    (name: SelectedName, flowConfig: StartFlowConfig) => {
      const tokenSymbol = getTokenMetadataWithAddress(
        flowConfig.tokenAddress,
      ).symbol

      setSavedParams({
        name,
        duration: flowConfig.duration,
        tokenAddress: flowConfig.tokenAddress,
        tokenPrice: flowConfig.tokenPrice,
        tokenSymbol,
      })
    },
    [],
  )

  const startMultiFlow = useCallback(
    (names: SelectedName[], flowConfig: StartMultiFlowConfig) => {
      const tokenSymbol = getTokenMetadataWithAddress(
        flowConfig.tokenAddress,
      ).symbol

      setMultiSavedParams({
        names,
        duration: flowConfig.duration,
        tokenAddress: flowConfig.tokenAddress,
        tokenPrice: flowConfig.tokenPrice,
        tokenSymbol,
      })
    },
    [],
  )

  return {
    transactions: multiSavedParams ? multiTransactions : transactions,
    startFlow,
    startMultiFlow,
  }
}
