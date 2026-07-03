import { transactionManager } from '@ens-apps/transaction-manager'
import { REFERER_ADDRESS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import {
  renewNameV1WriteParameters,
  renewNameWriteParameters,
} from '@ensdomains/ensjs/wallet/v2'
import { useQueryClient } from '@tanstack/react-query'
import { getWalletClient } from '@wagmi/core/actions'
import { useState } from 'react'
import {
  type Account,
  type Address,
  encodeFunctionData,
  erc20Abi,
  type Transport,
  type WalletClient,
} from 'viem'
import { useConfig, useConnection, usePublicClient } from 'wagmi'
import { getV1ExpiryQueryOptions } from '@/features/profile/hooks/useV1Expiry'
import { getV2RegistrationDataQueryOptions } from '@/features/profile/hooks/useV2RegistrationData'
import { getTokenMetadataWithAddress } from '@/features/register/utils/tokenLookup'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import type { Transaction } from '@/features/transaction-manager/types'
import { sepoliaWithEns } from '@/lib/wagmi'
import { getRenewerAddress } from '../utils/renewer'

// Account-bearing wallet client typed against the ENS-extended Sepolia chain, so
// its `contracts` satisfy the ensjs renew write-params (`renewName` /
// `renewNameV1` resolve the renewer address from `client.chain`).
type RenewerWalletClient = WalletClient<
  Transport,
  typeof sepoliaWithEns,
  Account
>

export type SelectedName = {
  readonly name: string
  readonly isV2: boolean
  readonly expiryDate?: Date | null
}

export type RenewalFlowType = 'single' | 'multi'

export const RENEWAL_TX_IDS = {
  approve: 'renewal-approve',
  renew: (name: string) => `renewal-renew-${name}`,
} as const

type SavedRenewalParams = {
  readonly name: SelectedName
  readonly duration: number
  readonly tokenAddress: Address
  readonly tokenPrice: bigint
  readonly tokenAllowance: bigint
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
  readonly tokenAllowance: bigint
  readonly tokenSymbol: 'USDC' | 'DAI'
}

export type StartFlowConfig = {
  readonly duration: number
  readonly tokenAddress: Address
  readonly tokenPrice: bigint
  readonly tokenAllowance?: bigint
}

export type StartMultiFlowConfig = {
  readonly renewals: readonly MultiRenewalEntry[]
  readonly tokenAddress: Address
  readonly tokenPrice: bigint
  readonly tokenAllowance?: bigint
}

type UseRenewalTransactionsOptions = {
  readonly onComplete?: (flowType: RenewalFlowType) => void
}

type ApproveParams = {
  readonly from: Address
  readonly tokenAddress: Address
  readonly tokenPrice: bigint
  readonly tokenSymbol: string | undefined
  readonly publicClient: NonNullable<ReturnType<typeof usePublicClient>>
  /** ERC-20 spender = the renewer contract (ETHRegistrar or ETHRenewerV1). */
  readonly renewer: Address
}

type RenewParams = {
  readonly name: string
  readonly duration: number
  readonly tokenAddress: Address
  readonly from: Address
  readonly publicClient: NonNullable<ReturnType<typeof usePublicClient>>
  /** Whether the name is v2 — selects the ensjs renew action (registrar vs ETHRenewerV1). */
  readonly isV2: boolean
  /** Account-bearing client the ensjs renew write-params are built against. */
  readonly walletClient: RenewerWalletClient
}

type BuildMultiTransactionsParams = {
  readonly multiSavedParams: MultiSavedRenewalParams
  readonly from: Address
  readonly publicClient: NonNullable<ReturnType<typeof usePublicClient>>
  readonly getRuntime: () => Promise<RenewalRuntime>
  readonly handleDone: () => void
}

type RenewalRuntime = {
  readonly from: Address
  readonly publicClient: NonNullable<ReturnType<typeof usePublicClient>>
  readonly signer: ReturnType<typeof createEOASigner>
  readonly walletClient: RenewerWalletClient
}

function buildApproveTransaction(
  params: ApproveParams,
  signer: ReturnType<typeof createEOASigner>,
) {
  const approveData = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'approve',
    args: [params.renewer, params.tokenPrice * 2n],
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
        chainId: sepoliaWithEns.id,
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
  // v2 names renew on the ETHRegistrar; unmigrated v1 names on ETHRenewerV1.
  // Both are ensjs write-param builders (label extraction, arg encoding, and
  // renewer address all resolved by ensjs) — no hand-rolled ABI/address here.
  const renewParams = {
    name: params.name,
    duration: params.duration,
    paymentToken: params.tokenAddress,
    referrer: REFERER_ADDRESS,
  }
  const writeParams = params.isV2
    ? renewNameWriteParameters(params.walletClient, renewParams)
    : renewNameV1WriteParameters(params.walletClient, renewParams)
  const renewData = encodeFunctionData({
    abi: writeParams.abi,
    functionName: writeParams.functionName,
    args: writeParams.args,
  })

  transactionManager.startTransaction(
    {
      type: 'custom',
      request: {
        type: 'eoa',
        from: params.from,
        to: writeParams.address,
        data: renewData,
        value: 0n,
        chainId: sepoliaWithEns.id,
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
  getRuntime,
  handleDone,
}: BuildMultiTransactionsParams): Transaction[] {
  const { renewals, tokenAddress, tokenSymbol, tokenPrice, tokenAllowance } =
    multiSavedParams

  if (renewals.length === 0) return []

  const makeRenewFn = (renewal: MultiRenewalEntry) => async () => {
    const { signer, walletClient } = await getRuntime()
    buildRenewTransaction(
      {
        name: renewal.selectedName.name,
        duration: renewal.duration,
        tokenAddress,
        from,
        publicClient,
        isV2: renewal.selectedName.isV2,
        walletClient,
      },
      signer,
    )
  }

  const renewFns = renewals.map((renewal) => makeRenewFn(renewal))

  const renewTxs: Transaction[] = renewals.map((renewal, i) => ({
    id: RENEWAL_TX_IDS.renew(renewal.selectedName.name),
    title: `Extend ${renewal.selectedName.name}`,
    transactionName: `Extend ${renewal.selectedName.name}`,
    estimatedGasCost: 0.001,
    onStart: renewFns[i],
    onDone: i < renewals.length - 1 ? renewFns[i + 1] : handleDone,
  }))

  if (tokenAllowance >= tokenPrice) {
    return renewTxs
  }

  const approveTx: Transaction = {
    id: RENEWAL_TX_IDS.approve,
    title: 'Approve payment',
    transactionName: `Approve ${tokenSymbol} for renewal`,
    estimatedGasCost: 0.0003,
    onStart: async () => {
      const { signer } = await getRuntime()
      buildApproveTransaction(
        {
          from,
          tokenAddress,
          tokenPrice,
          tokenSymbol,
          publicClient,
          // Multi-renew is v2-only (startMultiFlow filters to isV2), so a single
          // approval to the v2 ETHRegistrar covers the whole batch.
          renewer: getRenewerAddress(true),
        },
        signer,
      )
    },
    onDone: renewFns[0],
  }

  return [approveTx, ...renewTxs]
}

export const useRenewalTransactions = ({
  onComplete,
}: UseRenewalTransactionsOptions = {}) => {
  const config = useConfig()
  const connection = useConnection()
  const publicClient = usePublicClient()
  const queryClient = useQueryClient()
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
      walletClient: walletClient as RenewerWalletClient,
    }
  }

  const getRuntimeOrThrow = async (): Promise<RenewalRuntime> => {
    const runtime = await getRuntime()
    if (!runtime) throw new Error('No connected wallet')
    return runtime
  }

  const handleDone = () => {
    const flowType: RenewalFlowType = savedParams ? 'single' : 'multi'
    const renewedName = savedParams?.name.name
    closeModal()
    clearTransaction()
    setSavedParams(null)
    setMultiSavedParams(null)
    // Renewing pushes the name's expiry forward. Invalidate the expiry queries
    // so the grace banner clears and the new expiry shows on return. For v1
    // names this also re-qualifies the name for v1→v2 migration; the migration
    // eligibility query (on the migration-banner branch) reads this expiry and
    // re-runs on the refreshed data.
    if (renewedName) {
      queryClient.invalidateQueries({
        queryKey: getV1ExpiryQueryOptions({ name: renewedName }).queryKey,
      })
      queryClient.invalidateQueries({
        queryKey: getV2RegistrationDataQueryOptions({ name: renewedName })
          .queryKey,
      })
    }
    onComplete?.(flowType)
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
        renewer: getRenewerAddress(savedParams.name.isV2),
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
        isV2: savedParams.name.isV2,
        walletClient: runtime.walletClient,
      },
      runtime.signer,
    )
  }

  const needsApprove =
    savedParams !== null && savedParams.tokenAllowance < savedParams.tokenPrice

  const singleTransactions: Transaction[] = !savedParams
    ? []
    : needsApprove
      ? [
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
      : [
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
          getRuntime: getRuntimeOrThrow,
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
      tokenAllowance: flowConfig.tokenAllowance ?? 0n,
      tokenSymbol,
    })
  }

  const startMultiFlow = (flowConfig: StartMultiFlowConfig) => {
    const tokenSymbol = getTokenMetadataWithAddress(
      flowConfig.tokenAddress,
    ).symbol

    setSavedParams(null)
    setMultiSavedParams({
      renewals: flowConfig.renewals.filter((r) => r.selectedName.isV2),
      tokenAddress: flowConfig.tokenAddress,
      tokenPrice: flowConfig.tokenPrice,
      tokenAllowance: flowConfig.tokenAllowance ?? 0n,
      tokenSymbol,
    })
  }

  const clearIncompatibleRenewalState = (mode: RenewalFlowType) => {
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
