import { Trans } from '@lingui/react/macro'
import type { ReactNode } from 'react'
import { match } from 'ts-pattern'
import ethCoinIcon from '@/assets/icons/eth-coin.svg'
import { USDCIcon } from '@/components/atoms/StableCoinsIcons'
import { Button } from '@/components/ens-consumer/button/Button'
import { Card } from '@/components/ui/card'
import { decimalBigintToNumber } from '@/utils/formatting/decimalBigintToNumber'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import { tw } from '@/utils/tailwind'
import type { CheckoutAction } from '../lib/checkoutAvailability'
import type { CheckoutSummary } from '../lib/checkoutSummary'
import { AnimatedPrice } from './AnimatedPrice'
import { ExistingBalanceLabel } from './ExistingBalanceLabel'

const USDC_DECIMALS = 6

const toUsd = (raw: bigint) => decimalBigintToNumber(raw, USDC_DECIMALS)

const SavePill = ({ amount }: { readonly amount: number }) => (
  <span className="flex h-5 items-center rounded-[5px] bg-ens-signal-success-100 px-2 text-[#007C23] text-[15px] leading-none">
    <Trans>
      Save <AnimatedPrice value={amount} />
    </Trans>
  </span>
)

const Row = ({
  label,
  children,
}: {
  readonly label: ReactNode
  readonly children: ReactNode
}) => (
  <div className="flex items-baseline justify-between gap-2">
    <span className="text-ens-quartz-400 text-lg leading-none">{label}</span>
    <span className="flex items-center gap-2">{children}</span>
  </div>
)

const Usd = ({
  raw,
  isDeduction = false,
}: {
  readonly raw: bigint
  readonly isDeduction?: boolean
}) => (
  <>
    <span className="text-ens-quartz-900 text-xl leading-none">
      {isDeduction && '-'}
      {formatUsd(toUsd(raw))}
    </span>
    <span className="text-ens-quartz-400 text-lg leading-none">USD</span>
  </>
)

const TotalOnly = ({
  summary,
  discount,
}: {
  readonly summary: CheckoutSummary
  readonly discount: number
}) => (
  <div className="flex flex-col items-center gap-2 text-center">
    <span className="text-ens-lapis-500 text-xs uppercase">
      <Trans>Total USD</Trans>
    </span>
    <span className="font-medium font-semi-mono text-4xl text-ens-blue-midnight leading-ens-none md:text-5xl">
      <AnimatedPrice emphasis="soft" value={toUsd(summary.totalRaw)} />
    </span>
    {discount > 0 && <SavePill amount={discount} />}
  </div>
)

const WithExistingBalance = ({
  summary,
  discount,
}: {
  readonly summary: CheckoutSummary
  readonly discount: number
}) => (
  <div className="flex w-full flex-1 flex-col justify-between gap-8">
    <div className="flex flex-col gap-5">
      <Row label={<Trans>Name cost</Trans>}>
        {discount > 0 && <SavePill amount={discount} />}
        <Usd raw={summary.nameCostRaw} />
      </Row>
      <Row label={<ExistingBalanceLabel />}>
        <Usd isDeduction raw={summary.existingBalanceRaw} />
      </Row>
    </div>
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-ens-lapis-500 text-lg leading-none">
        <Trans>Total</Trans>
      </span>
      <span className="flex items-baseline gap-1.5">
        <span className="font-medium font-semi-mono text-ens-blue-midnight text-temp-32px leading-ens-none">
          <AnimatedPrice emphasis="soft" value={toUsd(summary.totalRaw)} />
        </span>
        <span className="text-ens-quartz-400 text-lg leading-none">USD</span>
      </span>
    </div>
  </div>
)

const AcceptedTokens = ({ acceptsEth }: { readonly acceptsEth: boolean }) => (
  <div className="flex items-center justify-center gap-2">
    <span className="text-[#7D7D7D] text-sm">
      <Trans>Accepted</Trans>
    </span>
    <span className="flex items-center gap-1">
      <USDCIcon className="size-5" />
      {acceptsEth && <img alt="ETH" className="size-5" src={ethCoinIcon} />}
    </span>
  </div>
)

type ConnectControl = Readonly<{ onConnect: () => void; isOpen: boolean }>

const ActionButton = ({
  action,
  onContinue,
  connect,
}: {
  readonly action: CheckoutAction
  readonly onContinue: () => void
  readonly connect: ConnectControl
}) => {
  const [label, onClick, isEnabled] = match(action)
    .returnType<readonly [ReactNode, () => void, boolean]>()
    .with({ kind: 'connect' }, () => [
      <Trans key="connect">Connect to register</Trans>,
      connect.onConnect,
      !connect.isOpen,
    ])
    .with({ kind: 'preparing' }, () => [
      <Trans key="preparing">Preparing...</Trans>,
      onContinue,
      false,
    ])
    .with({ kind: 'insufficient' }, () => [
      <Trans key="insufficient">Insufficient balance</Trans>,
      onContinue,
      false,
    ])
    .with({ kind: 'continue' }, ({ isEnabled }) => [
      <Trans key="continue">Continue to payment</Trans>,
      onContinue,
      isEnabled,
    ])
    .exhaustive()

  return (
    <Button
      className="w-full font-medium font-mono uppercase tracking-widest disabled:cursor-not-allowed"
      color="blue"
      disabled={!isEnabled}
      onClick={onClick}
      size="lg"
    >
      {label}
    </Button>
  )
}

/** The registration page's payment card: what the user pays and the way into the payment sheet. */
export const CheckoutSummaryCard = ({
  summary,
  discount,
  isLoading,
  header,
  action,
  acceptsEth,
  onContinue,
  connect,
}: {
  /** `undefined` until the name is priced. */
  readonly summary: CheckoutSummary | undefined
  readonly discount: number
  readonly isLoading: boolean
  /** Shown above the figures, such as the cooldown fee lines. */
  readonly header?: ReactNode
  readonly action: CheckoutAction
  readonly acceptsEth: boolean
  readonly onContinue: () => void
  readonly connect: ConnectControl
}) => (
  <Card className="flex-1 items-center justify-between gap-8 px-6 pt-12 pb-6 md:px-12">
    <div
      className={tw(
        'flex w-full flex-1 flex-col items-center justify-center gap-3',
        isLoading && 'animate-pulse',
      )}
    >
      {header}
      {summary && summary.existingBalanceRaw > 0n ? (
        <WithExistingBalance discount={discount} summary={summary} />
      ) : (
        <TotalOnly
          discount={discount}
          summary={
            summary ?? { nameCostRaw: 0n, existingBalanceRaw: 0n, totalRaw: 0n }
          }
        />
      )}
    </div>
    <div className="flex w-full flex-col gap-4">
      <ActionButton action={action} connect={connect} onContinue={onContinue} />
      <AcceptedTokens acceptsEth={acceptsEth} />
    </div>
  </Card>
)
