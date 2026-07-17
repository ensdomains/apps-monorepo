import type {
  CustomTransactionIntent,
  TransactionMachineActor,
} from '@ens-apps/transaction-manager'
import { AlertCircle, Info } from 'lucide-react'
import { fromThrowable } from 'neverthrow'
import type { ComponentType } from 'react'
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
}: {
  readonly actor: TransactionMachineActor | undefined
  readonly prepareIntent?: (
    ctx: IntentContext,
  ) => CustomTransactionIntent | undefined
}) => {
  const { data: walletClient } = useWalletClient()
  const readyWalletClient = walletClientIfReady(walletClient)

  const intent =
    readyWalletClient && prepareIntent
      ? fromThrowable(
          prepareIntent,
          () => undefined,
        )({
          walletClient: readyWalletClient,
          chainId: sepoliaWithEns.id,
        }).unwrapOr(undefined)
      : undefined

  const { cost, status } = useTransactionGasEstimate(actor, intent?.request)

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
              ? "This step's cost is estimated once it starts — its call depends on the step before it (e.g. a freshly deployed address)."
              : !readyWalletClient
                ? 'Connect your wallet on Sepolia to see the estimate.'
                : 'Preparing the estimate…'
          }
        />
      )
  }
}
