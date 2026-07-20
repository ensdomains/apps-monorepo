import type {
  CustomTransactionIntent,
  TransactionMachineActor,
} from '@ens-apps/transaction-manager'
import { AlertCircle, Info } from 'lucide-react'
import { fromThrowable } from 'neverthrow'
import { type ComponentType, useMemo } from 'react'
import { useWalletClient } from 'wagmi'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { sepoliaWithEns } from '@/lib/wagmi'
import { useTransactionGasEstimate } from '../hooks/useTransactionGasEstimate'
import type { IntentContext } from '../types'
import { walletClientIfReady } from '../utils/walletClientIfReady'

/** An icon + label that reveals an explanation on hover/focus. */
const EstimateHint = ({
  icon: Icon,
  label,
  tip,
}: {
  readonly icon: ComponentType<{ className?: string }>
  readonly label: string
  readonly tip: string
}) => (
  <Tooltip>
    <TooltipTrigger className="inline-flex items-center gap-1 text-muted-foreground cursor-help">
      <Icon className="size-3.5 shrink-0" />
      {label}
    </TooltipTrigger>
    <TooltipContent className="max-w-xs font-sans normal-case">
      {tip}
    </TooltipContent>
  </Tooltip>
)

/**
 * A transaction's estimated cost, from a live `eth_estimateGas` on its encoded
 * call. Owns the wallet/chain plumbing for every step: it reads the (global)
 * wallet client once, and — only when it's ready (account + chain) — asks the
 * step to build its intent. The builders throw on bad state, so the call is
 * wrapped with neverthrow's `fromThrowable` → `undefined`. Descriptor sites
 * therefore never touch the wallet, guard readiness, or risk crashing the render.
 *
 * Renders four honest states: the cost on success, "Estimating…" only while it's
 * actually calculating, and — with an explanatory tooltip — "Unavailable" when
 * the call would revert, or a neutral hint when there's nothing to estimate yet.
 */
export const EstimatedGasCost = ({
  actor,
  prepareIntent,
  prepareIntentPending = false,
  prepareIntentError = false,
}: {
  readonly actor: TransactionMachineActor | undefined
  readonly prepareIntent?: (
    ctx: IntentContext,
  ) => CustomTransactionIntent | undefined
  /** See {@link Transaction.prepareIntentPending} — async-intent bridge. */
  readonly prepareIntentPending?: boolean
  readonly prepareIntentError?: boolean
}) => {
  const { data: walletClient } = useWalletClient()
  // Require the wallet to be on the estimate's target chain: an intent built for
  // Sepolia can't be estimated against a wallet scoped to another network.
  const readyWalletClient = walletClientIfReady(walletClient, sepoliaWithEns.id)

  // Building the intent runs `encodeFunctionData` (and, for some flows, ensjs
  // write-param encoding). The modal re-renders on every actor-snapshot change,
  // so memoize on the inputs that actually change the intent to avoid re-encoding
  // on each render. `prepareIntent`'s identity is stable across those snapshot
  // re-renders (the owning hook doesn't re-run), so it's a sound cache key.
  const intent = useMemo(
    () =>
      readyWalletClient && prepareIntent
        ? fromThrowable(
            prepareIntent,
            () => undefined,
          )({
            walletClient: readyWalletClient,
            chainId: sepoliaWithEns.id,
          }).unwrapOr(undefined)
        : undefined,
    [readyWalletClient, prepareIntent],
  )

  const { cost, status: gasStatus } = useTransactionGasEstimate(
    actor,
    intent?.request,
  )

  // An async-intent flow (see the props above) surfaces its own resolution
  // state: a failed resolution is "Unavailable" and a pending one is
  // "Estimating…", overriding the gas query — which can't run until the intent
  // exists. Only applies before the step starts (the machine holds the real
  // request once running), so skip the override once the actor drives the call.
  const hasActiveRequest = actor?.getSnapshot()?.context.request?.type === 'eoa'
  const status =
    !hasActiveRequest && prepareIntentError
      ? 'error'
      : !hasActiveRequest && prepareIntentPending && !intent
        ? 'loading'
        : gasStatus

  switch (status) {
    case 'success':
      return <>{`${cost} ETH`}</>
    case 'loading':
      return <>{'Estimating…'}</>
    case 'error':
      return (
        <EstimateHint
          icon={AlertCircle}
          label="Unavailable"
          tip="This transaction can't be estimated — as configured it would fail on-chain (for example a missing role or an unmet prerequisite)."
        />
      )
    default:
      return (
        <EstimateHint
          icon={Info}
          label="Not yet"
          tip={
            !prepareIntent
              ? "This step's cost is estimated once it starts — it can't be worked out ahead of time."
              : !readyWalletClient
                ? 'Connect your wallet on Sepolia to see the estimate.'
                : 'Preparing the estimate…'
          }
        />
      )
  }
}
