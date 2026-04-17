import { transactionManager } from '@ens-apps/transaction-manager'
import { ERC20_ABI } from '@ens-apps/transaction-manager/contracts/abis/ERC20.abi'
import { REFERER_ADDRESS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { ethRegistrarRenewSnippet } from '@ensdomains/ensjs-abi/v2/ethRegistrar'
import { getWalletClient } from '@wagmi/core/actions'
import { useState } from 'react'
import { type Address, encodeFunctionData } from 'viem'
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
  renew: (name: string) => `renewal-renew-${name}`,
} as const

const ethRegistrar = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensEthRegistrar',
})

type SavedRenewalParams = {
  readonly name: SelectedName
  readonly duration: number
  readonly tokenAddress: Address
  readonly tokenPrice: bigint
  readonly tokenSymbol: 'USDC' | 'DAI'
}

export type MultiRenewalEntry = {
  readonly selectedName: SelectedName
  readonly duration: number
}

type MultiSavedRenewalParams = {
  readonly renewals: readonly MultiRenewalEntry[]
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
  readonly renewals: readonly MultiRenewalEntry[]
  readonly tokenAddress: Address
  readonly tokenPrice: bigint
}

type UseRenewalTransactionsOptions = {
  readonly onComplete: () => void
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

type BuildMultiTransactionsParams = {
  readonly multiSavedParams: MultiSavedRenewalParams
  readonly from: Address
  readonly publicClient: NonNullable<ReturnType<typeof usePublicClient>>
  readonly getSigner: () => Promise<ReturnType<typeof createEOASigner>>
  readonly handleDone: () => void
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

function buildRenewTransaction(
  params: RenewParams,
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
      id: RENEWAL_TX_IDS.renew(params.name),
      publicClient: params.publicClient,
      description: `Renew ${params.name}`,
    },
  )
}

function buildMultiTransactions({
  multiSavedParams,
  from,
  publicClient,
  getSigner,
  handleDone,
}: BuildMultiTransactionsParams): Transaction[] {
  const { renewals, tokenAddress, tokenSymbol, tokenPrice } = multiSavedParams

  if (renewals.length === 0) return []

  const makeRenewFn = (renewal: MultiRenewalEntry) => async () => {
    const signer = await getSigner()
    buildRenewTransaction(
      {
        name: renewal.selectedName.name,
        duration: renewal.duration,
        tokenAddress,
        from,
        publicClient,
      },
      signer,
    )
  }

  const renewFns = renewals.map((renewal) => makeRenewFn(renewal))

  const approveTx: Transaction = {
    id: RENEWAL_TX_IDS.approve,
    title: 'Approve payment',
    transactionName: `Approve ${tokenSymbol} for renewal`,
    estimatedGasCost: 0.0003,
    onStart: async () => {
      const signer = await getSigner()
      buildApproveTransaction(
        {
          from,
          tokenAddress,
          tokenPrice,
          tokenSymbol,
          publicClient,
        },
        signer,
      )
    },
    onDone: renewFns[0],
  }

  const renewTxs: Transaction[] = renewals.map((renewal, i) => ({
    id: RENEWAL_TX_IDS.renew(renewal.selectedName.name),
    title: `Extend ${renewal.selectedName.name}`,
    transactionName: `Extend ${renewal.selectedName.name}`,
    estimatedGasCost: 0.001,
    onStart: renewFns[i],
    onDone: i < renewals.length - 1 ? renewFns[i + 1] : handleDone,
  }))

  return [approveTx, ...renewTxs]
}

export const useRenewalTransactions = ({
  onComplete,
}: UseRenewalTransactionsOptions) => {
  const config = useConfig()
  const connection = useConnection()
  const publicClient = usePublicClient({ chainId: sepolia.id })
  const { closeModal, clearTransaction } = useTransactionModal()
  const [savedParams, setSavedParams] = useState<SavedRenewalParams | null>(
    null,
  )
  const [multiSavedParams, setMultiSavedParams] =
    useState<MultiSavedRenewalParams | null>(null)

  const getRuntime = async (): Promise<RenewalRuntime | null> => {
    if (!connection.address || !publicClient) return null

    const walletClient = await getWalletClient(config, {
      account: connection.address,
    })

    if (!walletClient) return null

    return {
      from: connection.address,
      publicClient,
      signer: createEOASigner(walletClient),
    }
  }

  const getSigner = async () => {
    const runtime = await getRuntime()
    if (!runtime) throw new Error('No connected wallet')
    return runtime.signer
  }

  const handleDone = () => {
    closeModal()
    clearTransaction()
    setSavedParams(null)
    setMultiSavedParams(null)
    onComplete()
  }

  const handleApproveStart = async () => {
    if (!savedParams) return

    const runtime = await getRuntime()
    if (!runtime) return

    buildApproveTransaction(
      {
        from: runtime.from,
        tokenAddress: savedParams.tokenAddress,
        tokenPrice: savedParams.tokenPrice,
        tokenSymbol: savedParams.tokenSymbol,
        publicClient: runtime.publicClient,
      },
      runtime.signer,
    )
  }

  const handleRenewStart = async () => {
    if (!savedParams) return

    const runtime = await getRuntime()
    if (!runtime) return

    buildRenewTransaction(
      {
        name: savedParams.name.name,
        duration: savedParams.duration,
        tokenAddress: savedParams.tokenAddress,
        from: runtime.from,
        publicClient: runtime.publicClient,
      },
      runtime.signer,
    )
  }

  const singleTransactions: Transaction[] = !savedParams
    ? []
    : [
        {
          id: RENEWAL_TX_IDS.approve,
          title: 'Approve payment',
          transactionName: `Approve ${savedParams.tokenSymbol} for renewal`,
          estimatedGasCost: 0.0003,
          onStart: handleApproveStart,
          onDone: handleRenewStart,
        },
        {
          id: RENEWAL_TX_IDS.renew(savedParams.name.name),
          title: `Extend ${savedParams.name.name}`,
          transactionName: `Extend ${savedParams.name.name}`,
          estimatedGasCost: 0.001,
          onStart: handleRenewStart,
          onDone: handleDone,
        },
      ]

  const multiTransactions: Transaction[] =
    !multiSavedParams || !connection.address || !publicClient
      ? []
      : buildMultiTransactions({
          multiSavedParams,
          from: connection.address,
          publicClient,
          getSigner,
          handleDone,
        })

  const startFlow = (name: SelectedName, flowConfig: StartFlowConfig) => {
    const tokenSymbol = getTokenMetadataWithAddress(
      flowConfig.tokenAddress,
    ).symbol

    setMultiSavedParams(null)
    setSavedParams({
      name,
      duration: flowConfig.duration,
      tokenAddress: flowConfig.tokenAddress,
      tokenPrice: flowConfig.tokenPrice,
      tokenSymbol,
    })
  }

  const startMultiFlow = (flowConfig: StartMultiFlowConfig) => {
    const tokenSymbol = getTokenMetadataWithAddress(
      flowConfig.tokenAddress,
    ).symbol

    setSavedParams(null)
    setMultiSavedParams({
      renewals: flowConfig.renewals,
      tokenAddress: flowConfig.tokenAddress,
      tokenPrice: flowConfig.tokenPrice,
      tokenSymbol,
    })
  }

  const clearIncompatibleRenewalState = (mode: 'single' | 'multi') => {
    if (mode === 'single') setMultiSavedParams(null)
    else setSavedParams(null)
  }

  return {
    transactions: multiSavedParams ? multiTransactions : singleTransactions,
    startFlow,
    startMultiFlow,
    clearIncompatibleRenewalState,
  }
}
