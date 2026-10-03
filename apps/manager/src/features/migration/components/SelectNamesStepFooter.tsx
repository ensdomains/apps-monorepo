import type { GasAffordability } from '@ens-apps/utils/gasAffordability'
import { useLingui } from '@lingui/react'
import { Plural, Trans } from '@lingui/react/macro'
import { CircleAlert } from 'lucide-react'
import { match } from 'ts-pattern'
import { formatUnits } from 'viem'
import { useVisibleCommemorativeNftStatus } from '@/features/migration/commemorative-nft/useVisibleCommemorativeNftEligibility'
import type { MigrationGasEstimateState } from '@/features/migration/hooks/useMigrationGasEstimate'
import { migrationPreparationMessage } from '@/features/migration/service/migrationPreparationError'
import { TOKENS } from '@/lib/tokens'
import type { GraceRenewalGasEstimateState } from '../hooks/useGraceRenewalGasEstimate'
import type { GraceRenewalQuoteState } from '../hooks/useGraceRenewalQuote'
import { GrainOverlay } from './GrainOverlay'
import { MigrationUpgradeButton } from './MigrationUpgradeButton'
import { WalletConfirmationStepsDialog } from './WalletConfirmationStepsDialog'

type GasEstimateMessageProps = {
  readonly gasEstimate: MigrationGasEstimateState | GraceRenewalGasEstimateState
  readonly gasAffordability: GasAffordability
  readonly isWaitingForGasFunding: boolean
  readonly totalSelected: number
  readonly renewal?: GraceRenewalQuoteState
}

const GasEstimateMessage = ({
  gasEstimate,
  gasAffordability,
  isWaitingForGasFunding,
  totalSelected,
  renewal,
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

  return match({ gasEstimate, gasAffordability })
    .with({ gasEstimate: { status: 'loading' } }, () => (
      <p>
        <Trans>Estimating the network fee...</Trans>
      </p>
    ))
    .with({ gasEstimate: { status: 'ready' } }, ({ gasEstimate: estimate }) => (
      <div>
        <p>
          <Trans>
            You&apos;ll approve{' '}
            <span className="whitespace-nowrap">
              <WalletConfirmationStepsDialog
                networkFeeEth={estimate.formattedEth}
                renewalCostUsdc={
                  renewal?.status === 'ready'
                    ? formatUnits(
                        renewal.quote.totalAmount,
                        TOKENS.USDC.decimals,
                      )
                    : undefined
                }
                requestCount={estimate.transactionCount}
                steps={
                  'plan' in estimate
                    ? estimate.plan.stepDescriptors
                    : estimate.stepDescriptors
                }
              />
              .
            </span>
          </Trans>
          <br />
          <Trans>Your wallet shows the final fee before you approve.</Trans>
        </p>
        {gasAffordability.status === 'short' && (
          <p className="text-destructive">
            <Trans>
              Not enough ETH for gas. Top up before you start, or some names
              will be left mid-upgrade.
            </Trans>
          </p>
        )}
      </div>
    ))
    .with({ gasEstimate: { status: 'error' } }, ({ gasEstimate: estimate }) => (
      <p>{_(migrationPreparationMessage(estimate))}</p>
    ))
    .otherwise(() => null)
}

type UpgradeButtonLabelProps = {
  readonly hasInsufficientUsdc: boolean
  readonly isEstimatingGas: boolean
  readonly isStarting: boolean
  readonly isWaitingForGasFunding: boolean
  readonly totalSelected: number
}

const UpgradeButtonLabel = ({
  hasInsufficientUsdc,
  isEstimatingGas,
  isStarting,
  isWaitingForGasFunding,
  totalSelected,
}: UpgradeButtonLabelProps) => {
  if (isStarting) return <Trans>Starting...</Trans>
  if (hasInsufficientUsdc) return <Trans>Insufficient USDC</Trans>
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
  readonly gasAffordability: GasAffordability
  readonly isEstimatingGas: boolean
  readonly isStarting: boolean
  readonly isUpgradeDisabled: boolean
  readonly isWaitingForGasFunding: boolean
  readonly onUpgrade: () => void
  readonly totalSelected: number
  readonly visibleCount: number
  readonly renewal: GraceRenewalQuoteState
  readonly renewalGasEstimate: GraceRenewalGasEstimateState
}

const GraceRenewalStatus = ({
  state,
}: {
  readonly state: GraceRenewalQuoteState
}) => {
  if (state.status === 'loading')
    return (
      <p>
        <Trans>Checking renewal costs...</Trans>
      </p>
    )
  if (state.status === 'error') return <p role="alert">{state.message}</p>
  if (state.status === 'ready' && state.quote.balance < state.quote.totalAmount)
    return (
      <p className="text-destructive" role="alert">
        <Trans>
          Not enough USDC to renew these names. Add USDC to your wallet to
          continue.
        </Trans>
      </p>
    )
  return null
}

export const SelectNamesStepFooter = ({
  gasEstimate,
  gasAffordability,
  isEstimatingGas,
  isStarting,
  isUpgradeDisabled,
  isWaitingForGasFunding,
  onUpgrade,
  totalSelected,
  visibleCount,
  renewal,
  renewalGasEstimate,
}: SelectNamesStepFooterProps) => {
  const { eligibility: nftEligibility, isConfirmedUnclaimed } =
    useVisibleCommemorativeNftStatus()
  const nftCopyEnabled = !!nftEligibility
  const hasInsufficientUsdc =
    renewal.status === 'ready' &&
    renewal.quote.balance < renewal.quote.totalAmount

  return (
    <div className="sticky inset-x-0 bottom-0 z-20 flex min-h-36 w-full shrink-0 flex-col items-stretch justify-start gap-4 bg-linear-to-b from-ens-garnet-100 to-ens-garnet-200 px-5 pt-4 pb-14 sm:min-h-28.75 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-8 lg:px-37.5">
      <GrainOverlay />
      <div className="relative flex max-w-107.5 flex-col gap-1 text-ens-garnet-900/75 text-xs leading-normal tracking-[-0.24px] sm:text-sm sm:leading-[1.2] sm:tracking-[-0.28px]">
        {renewal.status === 'idle' ? (
          <GasEstimateMessage
            gasAffordability={gasAffordability}
            gasEstimate={gasEstimate}
            isWaitingForGasFunding={isWaitingForGasFunding}
            totalSelected={totalSelected}
          />
        ) : (
          <>
            <GraceRenewalStatus state={renewal} />
            <GasEstimateMessage
              gasAffordability={gasAffordability}
              gasEstimate={renewalGasEstimate}
              isWaitingForGasFunding={isWaitingForGasFunding}
              renewal={renewal}
              totalSelected={totalSelected}
            />
          </>
        )}
      </div>
      <div className="relative flex w-full flex-col gap-1 sm:w-auto">
        <MigrationUpgradeButton
          className="w-full sm:w-[320px]"
          disabled={isUpgradeDisabled || hasInsufficientUsdc}
          onClick={onUpgrade}
          showNftPlaceholder={
            nftCopyEnabled && isConfirmedUnclaimed && visibleCount > 0
          }
          type="button"
        >
          <UpgradeButtonLabel
            hasInsufficientUsdc={hasInsufficientUsdc}
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
