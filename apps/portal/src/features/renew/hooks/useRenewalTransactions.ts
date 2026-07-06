import { type Signer, transactionManager } from '@ens-apps/transaction-manager'
import { REFERER_ADDRESS } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { l2EthRegistrarRenewSnippet } from '@ensdomains/ensjs/contracts'
import { useQueryClient } from '@tanstack/react-query'
import { getWalletClient } from '@wagmi/core/actions'
import { useState } from 'react'
import { match, P } from 'ts-pattern'
import {
  type Address,
  encodeFunctionData,
  erc20Abi,
  type PublicClient,
} from 'viem'
import { useConfig, useConnection, usePublicClient } from 'wagmi'
import { getV1ExpiryQueryOptions } from '@/features/profile/hooks/useV1Expiry'
import { getV2RegistrationDataQueryOptions } from '@/features/profile/hooks/useV2RegistrationData'
import { getTokenMetadataWithAddress } from '@/features/register/utils/tokenLookup'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import type { Transaction } from '@/features/transaction-manager/types'
import { sepoliaWithEns } from '@/lib/wagmi'
import { getLabel } from '@/utils/token/getLabel'
import { getRenewerAddress } from '../utils/renewer'

export type SelectedName = {
  readonly name: string
  readonly isV2: boolean
  readonly expiryDate?: Date | null
}

export type MultiRenewalEntry = {
  readonly selectedName: SelectedName
  readonly duration: number
}

export type RenewalFlowType = 'single' | 'multi'

export const RENEWAL_TX_IDS = {
  // Keyed by renewer (spender) so a mixed batch's two approvals — one to the v2
  // ETHRegistrar, one to ETHRenewerV1 — get distinct ids and don't collide.
  approve: (renewer: Address) => `renewal-approve-${renewer}`,
  renew: (name: string) => `renewal-renew-${name}`,
} as const

// The resolved payment for a flow: token + prices + the human symbol we derive
// once at start time (from the pre-resolution `Start*Config` the caller passes).
type TokenPayment = {
  readonly tokenAddress: Address
  readonly tokenPrice: bigint
  readonly tokenAllowance: bigint
  readonly tokenSymbol: 'USDC' | 'DAI'
}

// One flow is active at a time — either a single name or a batch. Modelling it as
// a discriminated union (rather than two nullable slots) makes "which flow" a
// stored fact, so illegal "both set" states are unrepresentable.
type SingleFlow = TokenPayment & {
  readonly kind: 'single'
  readonly selectedName: SelectedName
  readonly duration: number
}

// One approval target within a multi-renew batch: the renewer contract (ERC-20
// spender), the total owed to it in the chosen token, and the current allowance.
// A batch has one entry per distinct renewer among its names (1 for a same-kind
// batch, 2 for a mixed v1+v2 batch).
export type RenewerPayment = {
  readonly renewer: Address
  readonly total: bigint
  readonly allowance: bigint
}

type MultiFlow = {
  readonly kind: 'multi'
  readonly renewals: readonly MultiRenewalEntry[]
  readonly tokenAddress: Address
  readonly tokenSymbol: 'USDC' | 'DAI'
  readonly payments: readonly RenewerPayment[]
}

type RenewalFlow = SingleFlow | MultiFlow

export type StartFlowConfig = {
  readonly duration: number
  readonly tokenAddress: Address
  readonly tokenPrice: bigint
  readonly tokenAllowance?: bigint
}

export type StartMultiFlowConfig = {
  readonly renewals: readonly MultiRenewalEntry[]
  readonly tokenAddress: Address
  readonly payments: readonly RenewerPayment[]
}

type UseRenewalTransactionsOptions = {
  readonly onComplete?: (flowType: RenewalFlowType) => void
}

type RenewalRuntime = {
  readonly from: Address
  readonly publicClient: PublicClient
  readonly signer: Signer
}

type ApproveParams = {
  readonly from: Address
  readonly tokenAddress: Address
  readonly tokenPrice: bigint
  readonly tokenSymbol: string
  readonly publicClient: PublicClient
  /** ERC-20 spender = the renewer contract (ETHRegistrar or ETHRenewerV1). */
  readonly renewer: Address
}

type RenewParams = {
  readonly name: string
  readonly duration: number
  readonly tokenAddress: Address
  readonly from: Address
  readonly publicClient: PublicClient
  /** Selects the renewer address — v2 ETHRegistrar vs v1 ETHRenewerV1. */
  readonly isV2: boolean
}

type BuildMultiTransactionsParams = {
  readonly multiFlow: MultiFlow
  readonly from: Address
  readonly publicClient: PublicClient
  readonly getSigner: () => Promise<Signer>
  readonly handleDone: () => void
}

function buildApproveTransaction(
  params: ApproveParams,
  signer: Signer,
  // A mixed batch emits two approvals; only the first resets the manager. Later
  // approvals pass skipClear so they don't stop/clear the already-completed one.
  { skipClear = false }: { skipClear?: boolean } = {},
) {
  const approveData = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'approve',
    args: [params.renewer, params.tokenPrice * 2n],
  })

  if (!skipClear) transactionManager.clear()

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
      id: RENEWAL_TX_IDS.approve(params.renewer),
      publicClient: params.publicClient,
      description: `Approve ${params.tokenSymbol} for renewal`,
    },
  )
}

function buildRenewTransaction(params: RenewParams, signer: Signer) {
  // The v2 ETHRegistrar and the v1 ETHRenewerV1 share the identical
  // `renew(label, duration, paymentToken, referrer)` selector, so one ensjs
  // snippet encodes both; only the target address differs (getRenewerAddress).
  const renewData = encodeFunctionData({
    abi: l2EthRegistrarRenewSnippet,
    functionName: 'renew',
    args: [
      getLabel(params.name),
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
        to: getRenewerAddress(params.isV2),
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

// One ordered step of a multi-renew batch: its display metadata plus the action
// that starts the underlying transaction. Steps run in array order; each step's
// onDone triggers the next step's action, and the last step's onDone finishes.
type FlowStep = {
  readonly id: string
  readonly title: string
  readonly transactionName: string
  readonly estimatedGasCost: number
  readonly action: () => Promise<void>
}

function buildMultiTransactions({
  multiFlow,
  from,
  publicClient,
  getSigner,
  handleDone,
}: BuildMultiTransactionsParams): Transaction[] {
  const { renewals, tokenAddress, tokenSymbol, payments } = multiFlow

  if (renewals.length === 0) return []

  // Approvals: one per renewer group whose current allowance can't cover the
  // group total. ERC-20 allowance is per-spender, so a mixed v1+v2 batch needs
  // an approval to each renewer. Only the first approval clears the manager.
  const approveSteps: FlowStep[] = payments
    .filter((payment) => payment.allowance < payment.total)
    .map((payment, index) => ({
      id: RENEWAL_TX_IDS.approve(payment.renewer),
      title: 'Approve payment',
      transactionName: `Approve ${tokenSymbol} for renewal`,
      estimatedGasCost: 0.0003,
      action: async () => {
        const signer = await getSigner()
        buildApproveTransaction(
          {
            from,
            tokenAddress,
            tokenPrice: payment.total,
            tokenSymbol,
            publicClient,
            renewer: payment.renewer,
          },
          signer,
          { skipClear: index > 0 },
        )
      },
    }))

  const renewSteps: FlowStep[] = renewals.map((renewal) => ({
    id: RENEWAL_TX_IDS.renew(renewal.selectedName.name),
    title: `Extend ${renewal.selectedName.name}`,
    transactionName: `Extend ${renewal.selectedName.name}`,
    estimatedGasCost: 0.001,
    action: async () => {
      const signer = await getSigner()
      buildRenewTransaction(
        {
          name: renewal.selectedName.name,
          duration: renewal.duration,
          tokenAddress,
          from,
          publicClient,
          isV2: renewal.selectedName.isV2,
        },
        signer,
      )
    },
  }))

  const steps = [...approveSteps, ...renewSteps]

  return steps.map((step, i) => ({
    id: step.id,
    title: step.title,
    transactionName: step.transactionName,
    estimatedGasCost: step.estimatedGasCost,
    onStart: step.action,
    onDone: i < steps.length - 1 ? steps[i + 1].action : handleDone,
  }))
}

export const useRenewalTransactions = ({
  onComplete,
}: UseRenewalTransactionsOptions = {}) => {
  const config = useConfig()
  const connection = useConnection()
  const publicClient = usePublicClient()
  const queryClient = useQueryClient()
  const { closeModal, clearTransaction } = useTransactionModal()
  const [flow, setFlow] = useState<RenewalFlow | null>(null)

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

  const getSigner = async (): Promise<Signer> => {
    const runtime = await getRuntime()
    if (!runtime) throw new Error('No connected wallet')
    return runtime.signer
  }

  const handleDone = () => {
    const flowType: RenewalFlowType = flow?.kind ?? 'single'
    // Names renewed by this flow — one for single, all entries for multi.
    const renewedNames =
      flow?.kind === 'multi'
        ? flow.renewals.map((r) => r.selectedName.name)
        : flow?.kind === 'single'
          ? [flow.selectedName.name]
          : []
    closeModal()
    clearTransaction()
    setFlow(null)
    // Renewing pushes each name's expiry forward. Invalidate the expiry queries
    // so grace banners clear and the new expiry shows on return. For v1 names
    // this also re-qualifies the name for v1→v2 migration; the migration
    // eligibility query (on the migration-banner branch) reads this expiry and
    // re-runs on the refreshed data. (Multi-renew is v2-only, but invalidating
    // the v1 expiry there is a harmless no-op.)
    for (const renewedName of renewedNames) {
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
    if (flow?.kind !== 'single') return

    const runtime = await getRuntime()
    if (!runtime) return

    buildApproveTransaction(
      {
        from: runtime.from,
        tokenAddress: flow.tokenAddress,
        tokenPrice: flow.tokenPrice,
        tokenSymbol: flow.tokenSymbol,
        publicClient: runtime.publicClient,
        renewer: getRenewerAddress(flow.selectedName.isV2),
      },
      runtime.signer,
    )
  }

  const handleRenewStart = async () => {
    if (flow?.kind !== 'single') return

    const runtime = await getRuntime()
    if (!runtime) return

    buildRenewTransaction(
      {
        name: flow.selectedName.name,
        duration: flow.duration,
        tokenAddress: flow.tokenAddress,
        from: runtime.from,
        publicClient: runtime.publicClient,
        isV2: flow.selectedName.isV2,
      },
      runtime.signer,
    )
  }

  const transactions: Transaction[] = match(flow)
    .with(P.nullish, () => [])
    .with({ kind: 'multi' }, (multiFlow) => {
      if (!connection.address || !publicClient) return []
      return buildMultiTransactions({
        multiFlow,
        from: connection.address,
        publicClient,
        getSigner,
        handleDone,
      })
    })
    .with({ kind: 'single' }, (single) => {
      const renewTx: Transaction = {
        id: RENEWAL_TX_IDS.renew(single.selectedName.name),
        title: `Extend ${single.selectedName.name}`,
        transactionName: `Extend ${single.selectedName.name}`,
        estimatedGasCost: 0.001,
        onStart: handleRenewStart,
        onDone: handleDone,
      }

      if (single.tokenAllowance >= single.tokenPrice) return [renewTx]

      const approveTx: Transaction = {
        id: RENEWAL_TX_IDS.approve(getRenewerAddress(single.selectedName.isV2)),
        title: 'Approve payment',
        transactionName: `Approve ${single.tokenSymbol} for renewal`,
        estimatedGasCost: 0.0003,
        onStart: handleApproveStart,
        onDone: handleRenewStart,
      }

      return [approveTx, renewTx]
    })
    .exhaustive()

  const startFlow = (name: SelectedName, flowConfig: StartFlowConfig) => {
    const tokenSymbol = getTokenMetadataWithAddress(
      flowConfig.tokenAddress,
    ).symbol

    setFlow({
      kind: 'single',
      selectedName: name,
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

    setFlow({
      kind: 'multi',
      // No v1 filter here anymore: the caller (names table) already excludes v1
      // names that aren't on-chain renewable, and each renew targets its own
      // renewer. v1 + v2 names can share a batch.
      renewals: flowConfig.renewals,
      tokenAddress: flowConfig.tokenAddress,
      payments: flowConfig.payments,
      tokenSymbol,
    })
  }

  // Called before opening a flow's modal: drop any active flow of the other kind
  // so its stale transactions don't linger. No-op if the active flow matches.
  const clearIncompatibleRenewalState = (mode: RenewalFlowType) => {
    setFlow((current) =>
      match(current)
        .with({ kind: P.not(mode) }, () => null)
        .otherwise((flow) => flow),
    )
  }

  return {
    transactions,
    startFlow,
    startMultiFlow,
    clearIncompatibleRenewalState,
  }
}
