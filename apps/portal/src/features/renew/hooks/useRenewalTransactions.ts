import { transactionManager } from '@ens-apps/transaction-manager'
import { ERC20_ABI } from '@ens-apps/transaction-manager/contracts/abis/ERC20.abi'
import { FAST_TEST_ETH_REGISTRAR_ABI } from '@ens-apps/transaction-manager/contracts/abis/FastTestETHRegistrar.abi'
import {
  ENS_SEPOLIA_CONTRACTS,
  REFERER_ADDRESS,
} from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import {
  ethRegistrarControllerRenewSnippet,
  ethRegistrarControllerRentPriceSnippet,
} from '@ensdomains/ensjs/contracts'
import { getWalletClient } from '@wagmi/core/actions'
import { useCallback, useMemo, useState } from 'react'
import { type Address, encodeFunctionData } from 'viem'
import { readContract } from 'viem/actions'
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
  v1Renew: (name: string) => `renewal-v1-renew-${name}`,
  v2Renew: (name: string) => `renewal-v2-renew-${name}`,
} as const

type SavedRenewalParams = {
  readonly names: SelectedName[]
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

export const useRenewalTransactions = () => {
  const config = useConfig()
  const connection = useConnection()
  const publicClient = usePublicClient({ chainId: sepolia.id })
  const { closeModal, clearTransaction } = useTransactionModal()
  const [savedParams, setSavedParams] = useState<SavedRenewalParams | null>(
    null,
  )

  const getWallet = useCallback(async () => {
    if (!connection.address) throw new Error('No connected account')
    const walletClient = await getWalletClient(config, {
      connector: connection.connector,
      account: connection.address,
    })
    if (!walletClient) throw new Error('Failed to get wallet client')
    return walletClient
  }, [config, connection])

  const handleApproveStart = useCallback(async () => {
    if (
      !savedParams?.v2TokenAddress ||
      !savedParams.v2TokenPrice ||
      !connection.address ||
      !publicClient
    )
      return

    const walletClient = await getWallet()
    const signer = createEOASigner(walletClient)

    const approveData = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [
        ENS_SEPOLIA_CONTRACTS.FastTestETHRegistrar,
        savedParams.v2TokenPrice * 2n,
      ],
    })

    transactionManager.clear()

    transactionManager.startTransaction(
      {
        type: 'custom',
        request: {
          type: 'eoa',
          from: connection.address,
          to: savedParams.v2TokenAddress,
          data: approveData,
          value: 0n,
          chainId: sepolia.id,
        },
      },
      signer,
      {
        id: RENEWAL_TX_IDS.approve,
        publicClient,
        description: `Approve ${savedParams.v2TokenSymbol} for renewal`,
      },
    )
  }, [savedParams, connection, getWallet, publicClient])

  const makeV2RenewHandler = useCallback(
    (name: string) => async () => {
      if (!savedParams?.v2TokenAddress || !connection.address || !publicClient)
        return

      const walletClient = await getWallet()
      const signer = createEOASigner(walletClient)

      const label = name.replace('.eth', '')
      const renewData = encodeFunctionData({
        abi: FAST_TEST_ETH_REGISTRAR_ABI,
        functionName: 'renew',
        args: [
          label,
          BigInt(savedParams.duration),
          savedParams.v2TokenAddress,
          REFERER_ADDRESS,
        ],
      })

      transactionManager.startTransaction(
        {
          type: 'custom',
          request: {
            type: 'eoa',
            from: connection.address,
            to: ENS_SEPOLIA_CONTRACTS.FastTestETHRegistrar,
            data: renewData,
            value: 0n,
            chainId: sepolia.id,
          },
        },
        signer,
        {
          id: RENEWAL_TX_IDS.v2Renew(name),
          publicClient,
          description: `Renew ${name}`,
        },
      )
    },
    [savedParams, connection, getWallet, publicClient],
  )

  const makeV1RenewHandler = useCallback(
    (name: string) => async () => {
      if (!connection.address || !publicClient) return

      const walletClient = await getWallet()
      const signer = createEOASigner(walletClient)

      const label = name.replace('.eth', '')
      const priceResult = await readContract(publicClient, {
        address: ENS_SEPOLIA_CONTRACTS.ETHRegistrarController,
        abi: ethRegistrarControllerRentPriceSnippet,
        functionName: 'rentPrice',
        args: [label, BigInt(savedParams?.duration ?? 0)],
      })
      const rawPrice = priceResult.base + priceResult.premium
      const bufferedPrice = (rawPrice * 102n) / 100n

      const renewData = encodeFunctionData({
        abi: ethRegistrarControllerRenewSnippet,
        functionName: 'renew',
        args: [label, BigInt(savedParams?.duration ?? 0)],
      })

      transactionManager.startTransaction(
        {
          type: 'custom',
          request: {
            type: 'eoa',
            from: connection.address,
            to: ENS_SEPOLIA_CONTRACTS.ETHRegistrarController,
            data: renewData,
            value: bufferedPrice,
            chainId: sepolia.id,
          },
        },
        signer,
        {
          id: RENEWAL_TX_IDS.v1Renew(name),
          publicClient,
          description: `Renew ${name}`,
        },
      )
    },
    [savedParams, connection, getWallet, publicClient],
  )

  const handleDone = useCallback(() => {
    closeModal()
    clearTransaction()
  }, [closeModal, clearTransaction])

  const transactions: Transaction[] = useMemo(() => {
    if (!savedParams) return []

    const v1Names = savedParams.names.filter((n) => !n.isV2)
    const v2Names = savedParams.names.filter((n) => n.isV2)

    const allTxs: Transaction[] = []

    if (v2Names.length > 0) {
      const firstV2Renew = makeV2RenewHandler(v2Names[0].name)

      allTxs.push({
        id: RENEWAL_TX_IDS.approve,
        title: 'Approve payment',
        transactionName: `Approve ${savedParams.v2TokenSymbol ?? 'token'} for renewal`,
        estimatedGasCost: 0.0003,
        onStart: handleApproveStart,
        onDone: firstV2Renew,
      })

      v2Names.forEach(({ name }, index) => {
        const isLastV2 = index === v2Names.length - 1
        const nextHandler = isLastV2
          ? v1Names.length > 0
            ? makeV1RenewHandler(v1Names[0].name)
            : handleDone
          : makeV2RenewHandler(v2Names[index + 1].name)

        allTxs.push({
          id: RENEWAL_TX_IDS.v2Renew(name),
          title: `Extend ${name}`,
          transactionName: `Extend ${name}`,
          estimatedGasCost: 0.001,
          onStart: makeV2RenewHandler(name),
          onDone: nextHandler,
        })
      })
    }

    v1Names.forEach(({ name }, index) => {
      const isLast = index === v1Names.length - 1
      const nextHandler = isLast
        ? handleDone
        : makeV1RenewHandler(v1Names[index + 1].name)

      const isFirstV1 = index === 0
      const onStart = makeV1RenewHandler(name)

      allTxs.push({
        id: RENEWAL_TX_IDS.v1Renew(name),
        title: `Extend ${name}`,
        transactionName: `Extend ${name} (V1)`,
        estimatedGasCost: 0.001,
        onStart:
          isFirstV1 && v2Names.length === 0
            ? async () => {
                transactionManager.clear()
                await onStart()
              }
            : onStart,
        onDone: nextHandler,
      })
    })

    return allTxs
  }, [
    savedParams,
    handleApproveStart,
    makeV2RenewHandler,
    makeV1RenewHandler,
    handleDone,
  ])

  const startFlow = useCallback(
    (names: SelectedName[], flowConfig: StartFlowConfig) => {
      const v2TokenSymbol = flowConfig.v2TokenAddress
        ? getTokenMetadataWithAddress(flowConfig.v2TokenAddress).symbol
        : undefined

      setSavedParams({
        names,
        duration: flowConfig.duration,
        v2TokenAddress: flowConfig.v2TokenAddress,
        v2TokenPrice: flowConfig.v2TokenPrice,
        v2TokenSymbol,
      })
    },
    [],
  )

  return { transactions, startFlow }
}
