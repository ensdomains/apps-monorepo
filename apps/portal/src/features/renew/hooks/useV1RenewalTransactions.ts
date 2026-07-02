import { transactionManager } from '@ens-apps/transaction-manager'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { ethRegistrarControllerRenewSnippet } from '@ensdomains/ensjs-abi/v1/ethRegistrarController'
import { useQueryClient } from '@tanstack/react-query'
import { getWalletClient } from '@wagmi/core/actions'
import { useState } from 'react'
import { type Address, encodeFunctionData } from 'viem'
import { useConfig, useConnection, usePublicClient } from 'wagmi'
import { getMigrationStatusQueryOptions } from '@/features/migration/hooks/useMigrationStatus'
import { getV1ExpiryQueryOptions } from '@/features/profile/hooks/useV1Expiry'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import type { Transaction } from '@/features/transaction-manager/types'
import { sepoliaWithEns } from '@/lib/wagmi'
import { getLabel } from '@/utils/token/getLabel'

export const V1_RENEWAL_TX_IDS = {
  renew: (name: string) => `v1-renewal-renew-${name}`,
} as const

const ethRegistrarController = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensEthRegistrarController',
})

export type StartV1FlowConfig = {
  readonly durationSeconds: number
  /** ETH sent with `renew` — the priced total plus a safety buffer. */
  readonly value: bigint
}

type SavedV1RenewalParams = {
  readonly name: string
  readonly durationSeconds: number
  readonly value: bigint
}

type UseV1RenewalTransactionsOptions = {
  readonly onComplete?: () => void
}

/**
 * Renews a legacy (ENSv1) .eth name via the legacy
 * `ETHRegistrarController.renew(label, duration)`, paid in ETH as a single
 * transaction (no ERC-20 approval). Renewing pushes the registration expiry
 * back into the future, which re-qualifies the name for v1→v2 migration — so on
 * success we invalidate the name's expiry and migration-status queries to
 * surface the upgrade banner on return.
 */
export const useV1RenewalTransactions = ({
  onComplete,
}: UseV1RenewalTransactionsOptions = {}) => {
  const config = useConfig()
  const connection = useConnection()
  const publicClient = usePublicClient()
  const queryClient = useQueryClient()
  const { closeModal, clearTransaction } = useTransactionModal()
  const [savedParams, setSavedParams] = useState<SavedV1RenewalParams | null>(
    null,
  )

  const getSigner = async () => {
    if (!connection.address) throw new Error('No connected wallet')
    const walletClient = await getWalletClient(config, {
      account: connection.address,
    })
    if (!walletClient) throw new Error('No connected wallet')
    return createEOASigner(walletClient)
  }

  const handleDone = () => {
    closeModal()
    clearTransaction()
    const name = savedParams?.name
    setSavedParams(null)
    if (name) {
      queryClient.invalidateQueries({
        queryKey: getV1ExpiryQueryOptions({ name }).queryKey,
      })
      queryClient.invalidateQueries({
        queryKey: getMigrationStatusQueryOptions({
          name,
          address: connection.address,
        }).queryKey,
      })
    }
    onComplete?.()
  }

  const handleRenewStart = async () => {
    if (!savedParams || !connection.address || !publicClient) return
    const from = connection.address as Address
    const signer = await getSigner()

    const renewData = encodeFunctionData({
      abi: ethRegistrarControllerRenewSnippet,
      functionName: 'renew',
      args: [getLabel(savedParams.name), BigInt(savedParams.durationSeconds)],
    })

    transactionManager.clear()
    transactionManager.startTransaction(
      {
        type: 'custom',
        request: {
          type: 'eoa',
          from,
          to: ethRegistrarController,
          data: renewData,
          value: savedParams.value,
          chainId: sepoliaWithEns.id,
        },
      },
      signer,
      {
        id: V1_RENEWAL_TX_IDS.renew(savedParams.name),
        publicClient,
        description: `Renew ${savedParams.name}`,
      },
    )
  }

  const transactions: Transaction[] = !savedParams
    ? []
    : [
        {
          id: V1_RENEWAL_TX_IDS.renew(savedParams.name),
          title: `Extend ${savedParams.name}`,
          transactionName: `Extend ${savedParams.name}`,
          estimatedGasCost: 0.001,
          onStart: handleRenewStart,
          onDone: handleDone,
        },
      ]

  const startFlow = (name: string, flowConfig: StartV1FlowConfig) => {
    setSavedParams({
      name,
      durationSeconds: flowConfig.durationSeconds,
      value: flowConfig.value,
    })
  }

  return { transactions, startFlow }
}
