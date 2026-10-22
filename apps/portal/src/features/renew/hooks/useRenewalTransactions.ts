import type { CustomTransactionIntent } from '@ens-apps/transaction-manager'
import {
  type FlowScope,
  type Signer,
  scopeTransactionId,
  transactionManager,
  useAtomicBatchSupport,
} from '@ens-apps/transaction-manager'
import { useQueryClient } from '@tanstack/react-query'
import { getWalletClient } from '@wagmi/core/actions'
import { useState } from 'react'
import { match, P } from 'ts-pattern'
import type { Address, PublicClient } from 'viem'
import { useConfig, useConnection, usePublicClient } from 'wagmi'
import { getAddressNamesQueryKey } from '@/features/dashboard/hooks/useAddressNames'
import { getRegistrationDataQueryOptions } from '@/features/profile/hooks/useRegistrationData'
import { getV1ExpiryQueryOptions } from '@/features/profile/hooks/useV1Expiry'
import { getTokenMetadataWithAddress } from '@/features/register/utils/tokenLookup'
import { createEOASigner } from '@/features/registry/utils/signer.helpers'
import {
  buildApproveIntent,
  toEoaBatchIntent,
} from '@/features/transaction-manager/helpers/intents'
import { useFlowAttempt } from '@/features/transaction-manager/hooks/useFlowAttempt'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import type { Transaction } from '@/features/transaction-manager/types'
import { ensChain } from '@/lib/wagmi'
import { pollForIndexerSync } from '@/utils/query/pollForIndexerSync'
import {
  buildRenewBatchIntent,
  buildRenewIntent,
  type RenewParams,
} from '../utils/buildRenewIntent'
import { getRenewerAddress } from '../utils/renewer'
import { planMultiRenewSteps } from '../utils/renewerPayments'
import { getIsRenewableQueryOptions } from './useIsRenewable'

export type SelectedName = {
  readonly name: string
  readonly isV2: boolean
  readonly expiryDate?: Date | null
  readonly graceEndDate?: Date | null
}

export type MultiRenewalEntry = {
  readonly selectedName: SelectedName
  readonly duration: number
}

export type RenewalFlowType = 'single' | 'multi'

export const RENEWAL_TX_IDS = {
  // Keyed by renewer (spender) so a mixed batch's two approvals — one to the v2
  // ETHRegistrar, one to ETHRenewerV1 — get distinct ids and don't collide.
  // Still scoped per attempt: renewing the same name twice in a session would
  // otherwise leave the first run's finished actor under this id, and the
  // second run's modal would read it as already renewed.
  approve: (renewer: Address, scope: FlowScope | null) =>
    scopeTransactionId(`renewal-approve-${renewer}`, scope),
  renew: (name: string, scope: FlowScope | null) =>
    scopeTransactionId(`renewal-renew-${name}`, scope),
  renewBatch: (renewer: Address, batch: number, scope: FlowScope | null) =>
    scopeTransactionId(`renewal-renew-batch-${renewer}-${batch}`, scope),
  // Every approval and renew of one flow in a single EIP-5792 bundle.
  bundle: (key: string, scope: FlowScope | null) =>
    scopeTransactionId(`renewal-bundle-${key}`, scope),
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
  /** Fixed at start so a late capabilities answer can't reshape the modal. */
  readonly atomicBatching: boolean
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
  readonly atomicBatching: boolean
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

type BuildMultiTransactionsParams = {
  readonly multiFlow: MultiFlow
  readonly from: Address
  readonly publicClient: PublicClient
  readonly getSigner: () => Promise<Signer>
  readonly handleDone: () => void
}

// A mixed v1+v2 batch emits one approval per renewer (ERC-20 allowance is
// per-spender), so two rows would otherwise both read "Approve USDC for
// renewal". Tag each with the protocol version — derived from the spender
// address — so the user can tell the two approvals apart.
function approveLabel(tokenSymbol: string, renewer: Address): string {
  return `Approve ${tokenSymbol} for ${renewerVersion(renewer)} renewal`
}

function renewBatchLabel(
  renewals: readonly MultiRenewalEntry[],
  renewer: Address,
): string {
  return match(renewals)
    .with([P.select()], ({ selectedName }) => `Extend ${selectedName.name}`)
    .otherwise(
      () => `Extend ${renewals.length} ${renewerVersion(renewer)} names`,
    )
}

const renewerVersion = (renewer: Address) =>
  renewer === getRenewerAddress(true) ? 'v2' : 'v1'

// Approve exactly the quoted price. `renew()` takes no amount — the renewer
// pulls its own oracle price — so the allowance is the only cap on the charge,
// and the approval is the only wallet prompt that shows one. The renew price is
// a pure function of (label, duration, token), so there is no drift to pad for,
// and an exact approval is fully consumed rather than left standing.
function buildRenewalApproveIntent(params: {
  from: Address
  tokenAddress: Address
  renewer: Address
  tokenPrice: bigint
}): CustomTransactionIntent {
  return buildApproveIntent({
    from: params.from,
    token: params.tokenAddress,
    spender: params.renewer,
    amount: params.tokenPrice,
    chainId: ensChain.id,
  })
}

function buildApproveTransaction(
  params: ApproveParams,
  signer: Signer,
  // A mixed batch emits two approvals; only the first resets the manager. Later
  // approvals pass skipClear so they don't stop/clear the already-completed one.
  {
    skipClear = false,
    scope,
  }: { skipClear?: boolean; scope: FlowScope | null },
) {
  if (!skipClear) transactionManager.clear()

  transactionManager.startTransaction(
    buildRenewalApproveIntent({
      from: params.from,
      tokenAddress: params.tokenAddress,
      renewer: params.renewer,
      tokenPrice: params.tokenPrice,
    }),
    signer,
    {
      id: RENEWAL_TX_IDS.approve(params.renewer, scope),
      publicClient: params.publicClient,
      description: approveLabel(params.tokenSymbol, params.renewer),
    },
  )
}

// Approve + renew of one name as a single EIP-5792 bundle.
function buildSingleRenewalBundle(
  single: SingleFlow,
  from: Address,
  publicClient: PublicClient,
): CustomTransactionIntent {
  return toEoaBatchIntent([
    buildRenewalApproveIntent({
      from,
      tokenAddress: single.tokenAddress,
      renewer: getRenewerAddress(single.selectedName.isV2),
      tokenPrice: single.tokenPrice,
    }),
    buildRenewIntent({
      name: single.selectedName.name,
      duration: single.duration,
      tokenAddress: single.tokenAddress,
      from,
      publicClient,
      isV2: single.selectedName.isV2,
    }),
  ])
}

function buildRenewTransaction(
  params: RenewParams,
  signer: Signer,
  scope: FlowScope | null,
) {
  transactionManager.startTransaction(buildRenewIntent(params), signer, {
    id: RENEWAL_TX_IDS.renew(params.name, scope),
    publicClient: params.publicClient,
    description: `Renew ${params.name}`,
  })
}

// One ordered step of a multi-renew batch: its display metadata plus the action
// that starts the underlying transaction. Steps run in array order; each step's
// onDone triggers the next step's action, and the last step's onDone finishes.
type FlowStep = {
  readonly id: string
  readonly title: string
  readonly transactionName: string
  readonly prepareIntent?: NonNullable<Transaction['intent']>['prepare']
  readonly action: () => Promise<void>
}

function buildMultiTransactions({
  multiFlow,
  from,
  publicClient,
  getSigner,
  handleDone,
  scope,
}: BuildMultiTransactionsParams & {
  scope: FlowScope | null
}): Transaction[] {
  const { renewals, tokenAddress, tokenSymbol, payments } = multiFlow

  // Pure planner decides the ordered approve-then-renew steps (and which
  // approvals are needed / skipClear); we only wrap each into a Transaction.
  const plannedSteps = planMultiRenewSteps(renewals, payments)

  if (multiFlow.atomicBatching && plannedSteps.length > 1) {
    const bundleFor = (account: Address) =>
      toEoaBatchIntent(
        plannedSteps.map((step) =>
          step.kind === 'approve'
            ? buildRenewalApproveIntent({
                from: account,
                tokenAddress,
                renewer: step.renewer,
                tokenPrice: step.total,
              })
            : buildRenewBatchIntent({
                renewals: step.renewals,
                renewer: step.renewer,
                tokenAddress,
                from: account,
              }),
        ),
      )
    const id = RENEWAL_TX_IDS.bundle('multi', scope)
    const transactionName = `Extend ${renewals.length} names`
    return [
      {
        id,
        title: transactionName,
        transactionName,
        intent: {
          prepare: ({ walletClient }) =>
            bundleFor(walletClient.account.address),
        },
        onStart: async () => {
          const signer = await getSigner()
          transactionManager.clear()
          transactionManager.startTransaction(bundleFor(from), signer, {
            id,
            publicClient,
            description: transactionName,
          })
        },
        onDone: handleDone,
      },
    ]
  }

  // A renew reverts on a live estimate until its renewer is approved, so only
  // renews whose renewer has NO pending approval in this batch are estimable
  // up front; the rest estimate the moment their approval step completes.
  const renewersPendingApproval = new Set(
    plannedSteps
      .filter((step) => step.kind === 'approve')
      .map((step) => step.renewer),
  )

  const flowSteps: FlowStep[] = plannedSteps.map((step) =>
    step.kind === 'approve'
      ? {
          id: RENEWAL_TX_IDS.approve(step.renewer, scope),
          title: 'Approve payment',
          transactionName: approveLabel(tokenSymbol, step.renewer),
          prepareIntent: ({ walletClient }) =>
            buildRenewalApproveIntent({
              from: walletClient.account.address,
              tokenAddress,
              renewer: step.renewer,
              tokenPrice: step.total,
            }),
          action: async () => {
            const signer = await getSigner()
            buildApproveTransaction(
              {
                from,
                tokenAddress,
                tokenPrice: step.total,
                tokenSymbol,
                publicClient,
                renewer: step.renewer,
              },
              signer,
              { skipClear: step.skipClear, scope },
            )
          },
        }
      : {
          id: RENEWAL_TX_IDS.renewBatch(step.renewer, step.batch, scope),
          title: renewBatchLabel(step.renewals, step.renewer),
          transactionName: renewBatchLabel(step.renewals, step.renewer),
          prepareIntent: renewersPendingApproval.has(step.renewer)
            ? undefined
            : ({ walletClient }) =>
                buildRenewBatchIntent({
                  renewals: step.renewals,
                  renewer: step.renewer,
                  tokenAddress,
                  from: walletClient.account.address,
                }),
          action: async () => {
            transactionManager.startTransaction(
              buildRenewBatchIntent({
                renewals: step.renewals,
                renewer: step.renewer,
                tokenAddress,
                from,
              }),
              await getSigner(),
              {
                id: RENEWAL_TX_IDS.renewBatch(step.renewer, step.batch, scope),
                publicClient,
                description: renewBatchLabel(step.renewals, step.renewer),
              },
            )
          },
        },
  )

  return flowSteps.map((step, i) => ({
    id: step.id,
    title: step.title,
    transactionName: step.transactionName,
    intent: { prepare: step.prepareIntent },
    onStart: step.action,
    onDone: i < flowSteps.length - 1 ? flowSteps[i + 1].action : handleDone,
  }))
}

export const useRenewalTransactions = ({
  onComplete,
}: UseRenewalTransactionsOptions = {}) => {
  const config = useConfig()
  const connection = useConnection()
  const publicClient = usePublicClient()
  const queryClient = useQueryClient()
  const {
    openModal: openTransactionModal,
    closeModal,
    clearTransaction,
  } = useTransactionModal()
  // Names the attempt the modal is showing. Both a single renewal and a batch
  // are steps keyed by name/renewer, which are stable across attempts, so an
  // abandoned run would otherwise leave its finished actors behind.
  const attempt = useFlowAttempt()
  const [flow, setFlow] = useState<RenewalFlow | null>(null)
  const atomicBatching = useAtomicBatchSupport(ensChain.id)

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
    attempt.end()
    setFlow(null)
    // Renewing pushes each name's expiry forward. Invalidate the expiry queries
    // so grace banners clear and the new expiry shows on return. For v1 names
    // this also re-qualifies the name for v1→v2 migration; the migration
    // eligibility query (on the migration-banner branch) reads this expiry and
    // re-runs on the refreshed data. A batch may mix v1 and v2 names, so we
    // invalidate both queries for every name — the query for the name's other
    // protocol version is simply a harmless no-op. We also invalidate the v1
    // is-renewable query: a just-renewed v1 name leaves its grace window, so its
    // cached isRenewable=true is now stale and must not gate a future flow.
    for (const renewedName of renewedNames) {
      queryClient.invalidateQueries({
        queryKey: getV1ExpiryQueryOptions({ name: renewedName }).queryKey,
      })
      queryClient.invalidateQueries({
        queryKey: getRegistrationDataQueryOptions({ name: renewedName })
          .queryKey,
      })
      queryClient.invalidateQueries({
        queryKey: getIsRenewableQueryOptions({
          renewerAddress: getRenewerAddress(false),
          name: renewedName,
        }).queryKey,
      })
    }
    // The expiry rows and name lists read bigname, which may not have indexed the renewal yet.
    pollForIndexerSync({
      invalidateQueries: async () => {
        await Promise.all([
          ...renewedNames.map((renewedName) =>
            queryClient.invalidateQueries({
              queryKey: getRegistrationDataQueryOptions({ name: renewedName })
                .queryKey,
            }),
          ),
          queryClient.invalidateQueries({
            queryKey: [getAddressNamesQueryKey.key],
          }),
        ])
      },
    })
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
      { scope: attempt.scope },
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
      attempt.scope,
    )
  }

  const handleBundleStart = async () => {
    if (flow?.kind !== 'single') return

    const runtime = await getRuntime()
    if (!runtime) return

    transactionManager.clear()
    transactionManager.startTransaction(
      buildSingleRenewalBundle(flow, runtime.from, runtime.publicClient),
      runtime.signer,
      {
        id: RENEWAL_TX_IDS.bundle(flow.selectedName.name, attempt.scope),
        publicClient: runtime.publicClient,
        description: `Approve ${flow.tokenSymbol} and extend ${flow.selectedName.name}`,
      },
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
        scope: attempt.scope,
      })
    })
    .with({ kind: 'single' }, (single) => {
      const renewer = getRenewerAddress(single.selectedName.isV2)

      const renewTx: Transaction = {
        id: RENEWAL_TX_IDS.renew(single.selectedName.name, attempt.scope),
        title: `Extend ${single.selectedName.name}`,
        transactionName: `Extend ${single.selectedName.name}`,
        // Renew pulls the ERC-20 payment, so a live estimate reverts until the
        // allowance covers the price. Estimate only when it already does;
        // otherwise it estimates the moment the approval step completes.
        intent: {
          prepare:
            publicClient && single.tokenAllowance >= single.tokenPrice
              ? ({ walletClient }) =>
                  buildRenewIntent({
                    name: single.selectedName.name,
                    duration: single.duration,
                    tokenAddress: single.tokenAddress,
                    from: walletClient.account.address,
                    publicClient,
                    isV2: single.selectedName.isV2,
                  })
              : undefined,
        },
        onStart: handleRenewStart,
        onDone: handleDone,
      }

      if (single.tokenAllowance >= single.tokenPrice) return [renewTx]

      if (single.atomicBatching && publicClient) {
        const bundleTx: Transaction = {
          id: RENEWAL_TX_IDS.bundle(single.selectedName.name, attempt.scope),
          title: `Extend ${single.selectedName.name}`,
          transactionName: `Approve ${single.tokenSymbol} and extend ${single.selectedName.name}`,
          intent: {
            prepare: ({ walletClient }) =>
              buildSingleRenewalBundle(
                single,
                walletClient.account.address,
                publicClient,
              ),
          },
          onStart: handleBundleStart,
          onDone: handleDone,
        }
        return [bundleTx]
      }

      const approveTx: Transaction = {
        id: RENEWAL_TX_IDS.approve(renewer, attempt.scope),
        title: 'Approve payment',
        transactionName: approveLabel(single.tokenSymbol, renewer),
        intent: {
          prepare: ({ walletClient }) =>
            buildRenewalApproveIntent({
              from: walletClient.account.address,
              tokenAddress: single.tokenAddress,
              renewer,
              tokenPrice: single.tokenPrice,
            }),
        },
        onStart: handleApproveStart,
        onDone: handleRenewStart,
      }

      return [approveTx, renewTx]
    })
    .exhaustive()

  // Both starters name the attempt themselves, so a caller cannot open the
  // modal on unscoped step ids by forgetting to call `attempt.start`.
  const startFlow = (name: SelectedName, flowConfig: StartFlowConfig) => {
    const tokenSymbol = getTokenMetadataWithAddress(
      flowConfig.tokenAddress,
    ).symbol

    if (connection.address) {
      attempt.start(connection.address)
      openTransactionModal()
    }
    setFlow({
      kind: 'single',
      selectedName: name,
      duration: flowConfig.duration,
      tokenAddress: flowConfig.tokenAddress,
      tokenPrice: flowConfig.tokenPrice,
      tokenAllowance: flowConfig.tokenAllowance ?? 0n,
      tokenSymbol,
      atomicBatching,
    })
  }

  const startMultiFlow = (flowConfig: StartMultiFlowConfig) => {
    const tokenSymbol = getTokenMetadataWithAddress(
      flowConfig.tokenAddress,
    ).symbol

    if (connection.address) {
      attempt.start(connection.address)
      openTransactionModal()
    }
    setFlow({
      kind: 'multi',
      // No v1 filter here anymore: the caller (names table) already excludes v1
      // names that aren't on-chain renewable, and each renew targets its own
      // renewer. v1 + v2 names can share a batch.
      renewals: flowConfig.renewals,
      tokenAddress: flowConfig.tokenAddress,
      payments: flowConfig.payments,
      tokenSymbol,
      atomicBatching,
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
    // Exposed so a caller that reopens the modal for an already-named flow
    // (the "a transaction is already in flight" path) can open it without
    // minting a second scope for the same attempt.
    openModal: openTransactionModal,
  }
}
