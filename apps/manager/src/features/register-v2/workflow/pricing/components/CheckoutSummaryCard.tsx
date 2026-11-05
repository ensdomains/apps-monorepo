import { Trans } from '@lingui/react/macro'
import type { ReactNode } from 'react'
import { match } from 'ts-pattern'
import { formatUnits } from 'viem'
import { Button } from '@/components/ens-consumer/button/Button'
import { Card } from '@/components/ui/card'
import { formatUsd } from '@/utils/formatting/formatUsdCeil'
import { tw } from '@/utils/tailwind'
import type { CheckoutAction } from '../lib/checkoutAvailability'
import type { CheckoutSummary } from '../lib/checkoutSummary'
import { AnimatedPrice } from './AnimatedPrice'
import { ExistingBalanceLabel } from './ExistingBalanceLabel'
import { RECEIPT_AMOUNT, RECEIPT_LABEL } from './receiptTypography'

const USDC_DECIMALS = 6

const toUsd = (raw: bigint) => Number(formatUnits(raw, USDC_DECIMALS))

const SavePill = ({ amount }: { readonly amount: number }) => (
  // Figma's pill sets 15px, between the theme's text-sm and text-base.
  <span className="inline-block h-5 whitespace-nowrap rounded bg-ens-signal-success-100 px-2 text-[15px] text-ens-peridot-500 leading-5">
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
    <span className={RECEIPT_LABEL}>{label}</span>
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
    <span className={RECEIPT_AMOUNT}>
      {isDeduction && '-'}
      {formatUsd(toUsd(raw))}
    </span>
    <span className={RECEIPT_LABEL}>USD</span>
  </>
)

/** Set in the total's own type, so the card keeps its height when the figure arrives. */
const PENDING_FIGURE = 'animate-pulse rounded bg-ens-quartz-75 text-transparent'

/** The total, or a placeholder while the account's balance, and so the total, is still being read. */
const TotalAmount = ({
  raw,
  isPending,
  className,
}: {
  readonly raw: bigint
  readonly isPending: boolean
  readonly className: string
}) =>
  isPending ? (
    <span aria-hidden="true" className={tw(className, PENDING_FIGURE)}>
      $00.00
    </span>
  ) : (
    <span className={className}>
      <AnimatedPrice emphasis="soft" value={toUsd(raw)} />
    </span>
  )

/** The total leaves the network fee to the payment sheet, and says so. */
const NetworkFeesNote = () => (
  <span className="text-ens-quartz-550 text-xs leading-none">
    <Trans>+ network fees</Trans>
  </span>
)

type LayoutProps = Readonly<{
  summary: CheckoutSummary
  discount: number
  isTotalPending: boolean
}>

const TotalOnly = ({ summary, discount, isTotalPending }: LayoutProps) => (
  <div className="flex flex-col items-center gap-2 text-center">
    <span className="text-ens-lapis-500 text-xs uppercase">
      <Trans>Total USD</Trans>
    </span>
    <div className="flex flex-col items-center">
      <TotalAmount
        className="font-medium font-semi-mono text-4xl text-ens-blue-midnight leading-ens-none md:text-5xl"
        isPending={isTotalPending}
        raw={summary.totalRaw}
      />
      <NetworkFeesNote />
    </div>
    {discount > 0 && <SavePill amount={discount} />}
  </div>
)

const WithExistingBalance = ({
  summary,
  discount,
}: Omit<LayoutProps, 'isTotalPending'>) => (
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
    <div className="flex flex-col items-end gap-0.5">
      <div className="flex w-full items-baseline justify-between gap-2">
        <span className="text-ens-lapis-500 text-lg leading-none">
          <Trans>Total</Trans>
        </span>
        <span className="flex items-baseline gap-1.5">
          <TotalAmount
            className="font-medium font-semi-mono text-ens-blue-midnight text-temp-32px leading-ens-none"
            isPending={false}
            raw={summary.totalRaw}
          />
          <span className={RECEIPT_LABEL}>USD</span>
        </span>
      </div>
      <NetworkFeesNote />
    </div>
  </div>
)

const acceptedTokenExamples = [
  {
    symbol: 'USDC',
    logoURI:
      'https://files.cow.fi/token-lists/images/1/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48/logo.png',
  },
  {
    symbol: 'DAI',
    logoURI:
      'https://files.cow.fi/token-lists/images/1/0x6b175474e89094c44da98b954eedeac495271d0f/logo.png',
  },
  {
    symbol: 'WETH',
    logoURI:
      'https://files.cow.fi/token-lists/images/1/0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2/logo.png',
  },
  {
    symbol: 'ENS',
    logoURI:
      'https://assets.coingecko.com/coins/images/19785/large/ENS.jpg?1727872989',
  },
] as const

const tokenBadgeClass =
  'flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-white'

const AcceptedTokens = ({ acceptsEth }: { readonly acceptsEth: boolean }) => (
  <div className="flex items-center justify-center gap-2">
    <span className="text-ens-quartz-400 text-xs">
      <Trans>Accepted</Trans>
    </span>
    <span className="flex items-center -space-x-1.5">
      {acceptedTokenExamples
        .slice(0, acceptsEth ? acceptedTokenExamples.length : 1)
        .map((token) => (
          <span
            className={tokenBadgeClass}
            key={token.symbol}
            title={token.symbol}
          >
            <img
              alt={token.symbol}
              className="size-full rounded-full object-cover"
              src={token.logoURI}
            />
          </span>
        ))}
      {acceptsEth && (
        <span
          className={`${tokenBadgeClass} border border-ens-quartz-100 font-semibold text-[10px] text-ens-blue-midnight`}
          title="More supported tokens"
        >
          +
        </span>
      )}
    </span>
  </div>
)

type ConnectControl = Readonly<{
  onConnect: () => void
  isOpen: boolean
  /** "Connect to register" by default. */
  label?: ReactNode
}>

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
    .with({ kind: 'loading' }, () => [
      <Trans key="loading">Loading...</Trans>,
      onContinue,
      false,
    ])
    .with({ kind: 'connect' }, () => [
      connect.label ?? <Trans key="connect">Connect to register</Trans>,
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
  isTotalPending,
  header,
  action,
  acceptsEth,
  onContinue,
  connect,
}: {
  /** `undefined` until the name is priced. */
  readonly summary: CheckoutSummary | undefined
  readonly discount: number
  /** The name's price is loading. */
  readonly isLoading: boolean
  /** The account's balance, and so the total, is still being read. */
  readonly isTotalPending: boolean
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
      {/* The rows only once a balance is known; until then nothing says the user has one. */}
      {summary &&
      !isTotalPending &&
      action.kind !== 'loading' &&
      summary.existingBalanceRaw > 0n ? (
        <WithExistingBalance discount={discount} summary={summary} />
      ) : (
        <TotalOnly
          discount={discount}
          isTotalPending={
            isTotalPending || action.kind === 'loading' || summary === undefined
          }
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
