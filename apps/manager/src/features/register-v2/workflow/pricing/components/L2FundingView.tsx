import { useLingui } from '@lingui/react/macro'
import { useSelector } from '@xstate/react'
import type { ReactNode } from 'react'
import { match } from 'ts-pattern'
import { Button } from '@/components/ui/button'
import { MSymbol } from '@/components/ui/material-symbol'
import { cn } from '@/lib/utils'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import type {
  L2FundingFailure,
  L2FundingReview,
} from '../../../state/l2Funding.machine'
import { useRegistrationV2Context } from '../../../state/registrationUi.context'
import { getL2FundingActor } from '../../../state/registrationUi.machine'

const usd = (raw: bigint) => formatUsd(decimalBigintToNumber(raw, 6))

type Action = { readonly label: string; readonly onClick: () => void }

const FundingStep = ({
  title,
  body,
  isBusy = false,
  details,
  primary,
  secondary,
}: {
  readonly title: string
  readonly body: ReactNode
  readonly isBusy?: boolean
  readonly details?: ReactNode
  readonly primary?: Action
  readonly secondary?: Action
}) => (
  <div className="flex h-full min-h-0 flex-1 flex-col gap-6 pt-2 pb-6">
    <div
      aria-live="polite"
      className="flex flex-1 flex-col items-center justify-center gap-4 text-center"
    >
      {isBusy && (
        <MSymbol className="animate-spin text-ens-blue" symbol="cached" />
      )}
      <h2 className="font-medium text-[18px] leading-ens-none">{title}</h2>
      <p className="max-w-sm text-ens-gray text-sm">{body}</p>
      {details}
    </div>
    {primary && (
      <Button
        className={cn(
          'h-20 w-full rounded bg-ens-blue font-medium font-mono text-sm text-white uppercase tracking-wider',
          'hover:bg-ens-blue-hover',
        )}
        onClick={primary.onClick}
      >
        {primary.label}
      </Button>
    )}
    {secondary && (
      <Button onClick={secondary.onClick} variant="ghost">
        {secondary.label}
      </Button>
    )}
  </div>
)

/** Bridging the wallet's shortfall in from an L2, step by step. */
export const L2FundingView = () => {
  const { t } = useLingui()
  const { uiActor } = useRegistrationV2Context()
  const fundingActor = useSelector(uiActor, getL2FundingActor)
  const snapshot = useSelector(fundingActor, (state) => state)
  if (!fundingActor || !snapshot) return null

  const { route, quote, agreedAmountIn, failure, review, record } =
    snapshot.context
  const from = route.sourceChain.name
  const to = route.targetChain.name
  const amountIn = quote?.amountIn ?? record?.amountIn ?? agreedAmountIn
  const amountReceived = quote?.amountReceived ?? route.amountOut
  const back = {
    label: t`Back`,
    onClick: () => fundingActor.send({ type: 'cancel' }),
  }

  const reviewNote = (reason: L2FundingReview | undefined) =>
    match(reason)
      .with(
        'price-changed',
        () =>
          t`The bridge fee changed. Check the new amount before you continue.`,
      )
      .with(
        'expired',
        () =>
          t`The quote expired before it was signed. Check it and sign again.`,
      )
      .with('declined', () => t`The request was declined in your wallet.`)
      .otherwise(() => t`Check the transfer before you continue.`)

  const failureNote = (reason: L2FundingFailure | undefined) =>
    match(reason)
      .with('gas', () => t`You need a little ETH on ${from} to approve USDC.`)
      .with(
        'approval',
        () => t`The USDC approval on ${from} didn't go through.`,
      )
      .with('quote', () => t`No bridge from ${from} is available right now.`)
      .with('submit', () => t`The transfer couldn't be submitted.`)
      .with(
        'bridge',
        () => t`The bridge didn't complete, so your USDC stays on ${from}.`,
      )
      .otherwise(() => t`We couldn't reach ${from}. Check your connection.`)

  return match(snapshot.value)
    .with('starting', 'checkingAllowance', 'quoting', () => (
      <FundingStep
        body={t`Checking the route from ${from}.`}
        isBusy
        title={t`Preparing your transfer`}
      />
    ))
    .with('approving', () => (
      <FundingStep
        body={t`Approve USDC on ${from} in your wallet. This is needed once per network and uses a little ETH for gas.`}
        isBusy
        title={t`Allow USDC on ${from}`}
      />
    ))
    .with('review', () => (
      <FundingStep
        body={reviewNote(review)}
        details={
          <dl className="grid w-full max-w-sm grid-cols-[1fr_auto] gap-x-4 gap-y-2 rounded-xl bg-ens-quartz-50 p-4 text-left text-sm">
            <dt className="text-ens-gray">{t`You send on ${from}`}</dt>
            <dd className="text-right tabular-nums">{usd(amountIn)}</dd>
            <dt className="text-ens-gray">{t`You receive on ${to}`}</dt>
            <dd className="text-right tabular-nums">{usd(amountReceived)}</dd>
          </dl>
        }
        primary={{
          label: t`Continue`,
          onClick: () => fundingActor.send({ type: 'confirm' }),
        }}
        secondary={back}
        title={t`Review the transfer`}
      />
    ))
    .with('signing', () => (
      <FundingStep
        body={t`Sign in your wallet to send ${usd(amountIn)} from ${from} to your wallet on ${to}.`}
        isBusy
        title={t`Sign the transfer`}
      />
    ))
    .with('bridging', () => (
      <FundingStep
        body={t`Sending ${usd(route.amountOut)} to your wallet on ${to}. This usually takes under a minute.`}
        isBusy
        title={t`Bridging USDC`}
      />
    ))
    .with('stalled', () => (
      <FundingStep
        body={t`If the transfer completes, the USDC arrives in your wallet on ${to}. If it doesn't, it stays on ${from}.`}
        primary={{
          label: t`Keep waiting`,
          onClick: () => fundingActor.send({ type: 'keepWaiting' }),
        }}
        secondary={back}
        title={t`This is taking longer than usual`}
      />
    ))
    .with('failed', () => (
      <FundingStep
        body={failureNote(failure)}
        primary={{
          label: t`Try again`,
          onClick: () => fundingActor.send({ type: 'retry' }),
        }}
        secondary={back}
        title={t`The transfer didn't go through`}
      />
    ))
    .with('done', () => null)
    .exhaustive()
}
