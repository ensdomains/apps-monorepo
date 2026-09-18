import { useLingui } from '@lingui/react'
import { Plural, Trans } from '@lingui/react/macro'
import { CircleAlert } from 'lucide-react'
import { match } from 'ts-pattern'
import { useVisibleCommemorativeNftStatus } from '@/features/migration/commemorative-nft/useVisibleCommemorativeNftEligibility'
import type { MigrationGasEstimateState } from '@/features/migration/hooks/useMigrationGasEstimate'
import { migrationPreparationMessage } from '@/features/migration/service/migrationPreparationError'
import { GrainOverlay } from './GrainOverlay'
import { MigrationUpgradeButton } from './MigrationUpgradeButton'
import { WalletConfirmationStepsDialog } from './WalletConfirmationStepsDialog'

type GasEstimateMessageProps = {
  readonly gasEstimate: MigrationGasEstimateState
  readonly isWaitingForGasFunding: boolean
  readonly totalSelected: number
}

const GasEstimateMessage = ({
  gasEstimate,
  isWaitingForGasFunding,
  totalSelected,
}: GasEstimateMessageProps) => {
  const { _ } = useLingui()
  if (totalSelected === 0) return null

  // The gas drip request only resolves once any sepETH top-up is confirmed
  // on-chain. Surface it so the owner knows why the button is briefly blocked.
  if (isWaitingForGasFunding) {
    return (
      <p>
        <Trans>Getting your wallet ready...</Trans>
      </p>
    )
  }

  return match(gasEstimate)
    .with({ status: 'loading' }, () => (
      <p>
        <Trans>Estimating the network fee...</Trans>
      </p>
    ))
    .with({ status: 'ready' }, (estimate) => (
      <p>
        <Trans>
          Estimated network fee:{' '}
          <strong className="font-semibold">
            ~{estimate.formattedEth} ETH
          </strong>
          . You&apos;ll approve{' '}
          <span className="whitespace-nowrap">
            <WalletConfirmationStepsDialog
              steps={estimate.plan.stepDescriptors}
            />
            .
          </span>
          <br />
          Your wallet shows the final fee before you approve.
        </Trans>
      </p>
    ))
    .with({ status: 'error' }, (estimate) => (
      <p>{_(migrationPreparationMessage(estimate))}</p>
    ))
    .otherwise(() => null)
}

type UpgradeButtonLabelProps = {
  readonly isEstimatingGas: boolean
  readonly isStarting: boolean
  readonly isWaitingForGasFunding: boolean
  readonly totalSelected: number
}

const UpgradeButtonLabel = ({
  isEstimatingGas,
  isStarting,
  isWaitingForGasFunding,
  totalSelected,
}: UpgradeButtonLabelProps) => {
  if (isStarting) return <Trans>Starting...</Trans>
  if (isEstimatingGas) return <Trans>Estimating...</Trans>
  if (isWaitingForGasFunding) return <Trans>Preparing wallet...</Trans>
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
  readonly isWaitingForGasFunding: boolean
  readonly onUpgrade: () => void
  readonly totalSelected: number
  readonly visibleCount: number
}

export const SelectNamesStepFooter = ({
  gasEstimate,
  isEstimatingGas,
  isStarting,
  isUpgradeDisabled,
  isWaitingForGasFunding,
  onUpgrade,
  totalSelected,
  visibleCount,
}: SelectNamesStepFooterProps) => {
  const { eligibility: nftEligibility, isConfirmedUnclaimed } =
    useVisibleCommemorativeNftStatus()
  const nftCopyEnabled = !!nftEligibility

  return (
    <div className="sticky inset-x-0 bottom-0 z-20 flex min-h-36 w-full shrink-0 flex-col items-stretch justify-start gap-4 bg-linear-to-b from-ens-garnet-100 to-ens-garnet-200 px-5 pt-4 pb-14 sm:min-h-28.75 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-8 lg:px-37.5">
      <GrainOverlay />
      <div className="relative flex max-w-107.5 flex-col gap-1 text-ens-garnet-900/75 text-xs leading-normal tracking-[-0.24px] sm:text-sm sm:leading-[1.2] sm:tracking-[-0.28px]">
        <GasEstimateMessage
          gasEstimate={gasEstimate}
          isWaitingForGasFunding={isWaitingForGasFunding}
          totalSelected={totalSelected}
        />
      </div>
      <div className="relative flex w-full flex-col gap-1 sm:w-auto">
        <MigrationUpgradeButton
          className="w-full sm:w-[320px]"
          disabled={isUpgradeDisabled}
          onClick={onUpgrade}
          showNftPlaceholder={
            nftCopyEnabled && isConfirmedUnclaimed && visibleCount > 0
          }
          type="button"
        >
          <UpgradeButtonLabel
            isEstimatingGas={isEstimatingGas}
            isStarting={isStarting}
            isWaitingForGasFunding={isWaitingForGasFunding}
            totalSelected={totalSelected}
          />
        </MigrationUpgradeButton>
        {nftCopyEnabled &&
          totalSelected > 0 &&
          totalSelected < visibleCount && (
            <p className="flex items-center gap-1 text-ens-garnet-500 text-sm leading-[1.2] tracking-[0.14px]">
              <CircleAlert className="size-4 shrink-0" strokeWidth={1.8} />
              <Trans>Upgrade all names to receive NFT</Trans>
            </p>
          )}
      </div>
    </div>
  )
}
