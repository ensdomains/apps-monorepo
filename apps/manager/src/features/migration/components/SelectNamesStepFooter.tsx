import { Plural, Trans } from '@lingui/react/macro'
import { CircleAlert } from 'lucide-react'
import { match } from 'ts-pattern'
import type { MigrationGasEstimateState } from '@/features/migration/hooks/useMigrationGasEstimate'

type GasEstimateMessageProps = {
  readonly gasEstimate: MigrationGasEstimateState
  readonly totalSelected: number
}

const GasEstimateMessage = ({
  gasEstimate,
  totalSelected,
}: GasEstimateMessageProps) => {
  if (totalSelected === 0) return null

  return match(gasEstimate)
    .with({ status: 'loading' }, () => (
      <p>
        <Trans>Estimating migration gas...</Trans>
      </p>
    ))
    .with({ status: 'ready' }, (estimate) => (
      <p>
        <Trans>
          Estimated network fee:{' '}
          <strong className="font-semibold">
            ~{estimate.formattedEth} ETH
          </strong>{' '}
          across{' '}
          <strong className="font-semibold">
            {estimate.transactionCount} transactions
          </strong>
          .
          <br />
          Final fee confirmed in your wallet.
        </Trans>
      </p>
    ))
    .with({ status: 'error' }, () => (
      <p>
        <Trans>Gas estimate unavailable</Trans>
      </p>
    ))
    .otherwise(() => null)
}

type UpgradeButtonLabelProps = {
  readonly isEstimatingGas: boolean
  readonly isStarting: boolean
  readonly totalSelected: number
}

const UpgradeButtonLabel = ({
  isEstimatingGas,
  isStarting,
  totalSelected,
}: UpgradeButtonLabelProps) => {
  if (isEstimatingGas) return <Trans>Estimating...</Trans>
  if (isStarting) return <Trans>Starting...</Trans>
  return (
    <Plural
      one="Upgrade # name"
      other="Upgrade # names"
      value={totalSelected}
    />
  )
}

type SelectNamesStepFooterProps = {
  readonly gasEstimate: MigrationGasEstimateState
  readonly isEstimatingGas: boolean
  readonly isStarting: boolean
  readonly isUpgradeDisabled: boolean
  readonly onUpgrade: () => void
  readonly totalSelected: number
  readonly visibleCount: number
}

export const SelectNamesStepFooter = ({
  gasEstimate,
  isEstimatingGas,
  isStarting,
  isUpgradeDisabled,
  onUpgrade,
  totalSelected,
  visibleCount,
}: SelectNamesStepFooterProps) => (
  <div className="flex min-h-36 shrink-0 flex-col items-stretch justify-start gap-4 bg-[rgba(251,249,250,0.3)] px-5 pt-4 pb-14 sm:min-h-28.75 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-8 lg:px-[150px]">
    <div className="flex max-w-107.5 flex-col gap-1 text-ens-garnet-900/75 text-xs leading-normal tracking-[-0.24px] sm:text-sm sm:leading-[1.2] sm:tracking-[-0.28px]">
      <GasEstimateMessage
        gasEstimate={gasEstimate}
        totalSelected={totalSelected}
      />
      {totalSelected > 100 && (
        <p>
          <Trans>
            This will be split into {Math.ceil(totalSelected / 100)} batches —
            expect that many wallet signatures (plus approvals).
          </Trans>
        </p>
      )}
    </div>
    <div className="flex w-full flex-col gap-1 sm:w-auto">
      <button
        className="h-11.5 w-full min-w-40 overflow-hidden rounded-sm bg-ens-garnet-900 px-4 py-2.5 font-semi-mono text-ens-garnet-50 text-sm uppercase tracking-[1.68px] shadow-[inset_0px_-3px_0px_0px_rgba(0,0,0,0.35)] disabled:opacity-50 sm:w-[320px]"
        disabled={isUpgradeDisabled}
        onClick={onUpgrade}
        type="button"
      >
        <UpgradeButtonLabel
          isEstimatingGas={isEstimatingGas}
          isStarting={isStarting}
          totalSelected={totalSelected}
        />
      </button>
      {totalSelected > 0 && totalSelected < visibleCount && (
        <p className="flex items-center gap-1 text-ens-garnet-500 text-sm leading-[1.2] tracking-[0.14px]">
          <CircleAlert className="size-4 shrink-0" strokeWidth={1.8} />
          <Trans>Upgrade all names to receive NFT</Trans>
        </p>
      )}
    </div>
  </div>
)
