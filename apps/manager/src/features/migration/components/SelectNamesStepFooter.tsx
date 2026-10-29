import type { GasAffordability } from '@ens-apps/utils/gasAffordability'
import { useLingui } from '@lingui/react'
import { Plural, Trans } from '@lingui/react/macro'
import { CircleAlert } from 'lucide-react'
import { match } from 'ts-pattern'
import { formatUnits } from 'viem'
import { useVisibleCommemorativeNftStatus } from '@/features/migration/commemorative-nft/useVisibleCommemorativeNftEligibility'
import type { MigrationGasEstimateState } from '@/features/migration/hooks/useMigrationGasEstimate'
import { namesWithDroppedPubkey } from '@/features/migration/service/buildMigrationPlan'
import { migrationPreparationMessage } from '@/features/migration/service/migrationPreparationError'
import { TOKENS } from '@/lib/tokens'
import type { GraceRenewalGasEstimateState } from '../hooks/useGraceRenewalGasEstimate'
import type { GraceRenewalQuoteState } from '../hooks/useGraceRenewalQuote'
import { GrainOverlay } from './GrainOverlay'
import { MigrationUpgradeButton } from './MigrationUpgradeButton'
import type { MigrationRecoveryAction } from './selectNames.helpers'
import { WalletConfirmationStepsDialog } from './WalletConfirmationStepsDialog'

const DroppedPubkeyWarning = ({
  names,
}: {
  readonly names: readonly string[]
}) => {
  if (names.length === 0) return null
  const nameList = names.join(', ')
  return (
    <p className="flex items-start gap-1 text-ens-garnet-900" role="note">
      <CircleAlert className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.8} />
      <span>
        <Trans>
          Public key records can&apos;t be carried over by this upgrade and will
          stop resolving for {nameList}.
        </Trans>
      </span>
    </p>
  )
}

type GasEstimateMessageProps = {
  readonly gasEstimate: MigrationGasEstimateState | GraceRenewalGasEstimateState
  readonly gasAffordability: GasAffordability
  readonly isWaitingForGasFunding: boolean
  readonly totalSelected: number
  readonly recoveryAction?: MigrationRecoveryAction | null
  readonly renewal?: GraceRenewalQuoteState
}

const GasEstimateMessage = ({
  gasEstimate,
  gasAffordability,
  isWaitingForGasFunding,
  totalSelected,
  recoveryAction = null,
  renewal,
}: GasEstimateMessageProps) => {
  const { _ } = useLingui()
  if (totalSelected === 0 && recoveryAction === null) return null

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
        <DroppedPubkeyWarning
          names={
            'plan' in estimate
              ? namesWithDroppedPubkey(estimate.plan)
              : estimate.droppedPubkeyNames
          }
        />
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
  readonly recoveryAction?: MigrationRecoveryAction | null
}

const UpgradeButtonLabel = ({
  hasInsufficientUsdc,
  isEstimatingGas,
  isStarting,
  isWaitingForGasFunding,
  totalSelected,
  recoveryAction = null,
}: UpgradeButtonLabelProps) => {
  if (isStarting) return <Trans>Starting...</Trans>
  if (hasInsufficientUsdc) return <Trans>Insufficient USDC</Trans>
  if (isEstimatingGas) return <Trans>Estimating...</Trans>
  if (isWaitingForGasFunding) return <Trans>Preparing wallet...</Trans>
  if (recoveryAction === 'review-deployment') return <Trans>Continue</Trans>
  if (recoveryAction === 'finish-upgrade') return <Trans>Finish upgrade</Trans>
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
  readonly hasUnselectedEligibleNames: boolean
  readonly isEstimatingGas: boolean
  readonly isStarting: boolean
  readonly recoveryAction?: MigrationRecoveryAction | null
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
  if (state.status === 'ready') {
    const count = state.quote.items.filter(
      ({ duration }) => duration > 0n,
    ).length
    if (count === 0) return null
    const amount = formatUnits(state.quote.totalAmount, TOKENS.USDC.decimals)
    return (
      <p>
        <Trans>
          Renewing{' '}
          <strong>
            <Plural one="# name" other="# names" value={count} />
          </strong>{' '}
          for <strong>{amount} USDC</strong>
        </Trans>
      </p>
    )
  }
  return null
}

export const SelectNamesStepFooter = ({
  gasEstimate,
  gasAffordability,
  hasUnselectedEligibleNames,
  isEstimatingGas,
  isStarting,
  recoveryAction = null,
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
    <div className="sticky inset-x-0 bottom-0 z-20 flex min-h-36 w-full shrink-0 flex-col items-stretch justify-start gap-4 bg-linear-to-b from-ens-garnet-100 to-ens-garnet-200 px-5 pt-4 pb-14 sm:min-h-24 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-4 lg:px-37.5">
      <GrainOverlay />
      <div className="relative flex min-w-0 max-w-107.5 flex-col gap-1 text-ens-garnet-900/75 text-xs leading-normal tracking-[-0.24px] sm:text-sm sm:leading-[1.2] sm:tracking-[-0.28px]">
        {renewal.status === 'idle' ? (
          <GasEstimateMessage
            gasAffordability={gasAffordability}
            gasEstimate={gasEstimate}
            isWaitingForGasFunding={isWaitingForGasFunding}
            recoveryAction={recoveryAction}
            totalSelected={totalSelected}
          />
        ) : (
          <>
            <GraceRenewalStatus state={renewal} />
            {(!hasInsufficientUsdc ||
              renewalGasEstimate.status === 'ready') && (
              <GasEstimateMessage
                gasAffordability={gasAffordability}
                gasEstimate={renewalGasEstimate}
                isWaitingForGasFunding={isWaitingForGasFunding}
                renewal={renewal}
                totalSelected={totalSelected}
              />
            )}
            {hasInsufficientUsdc && (
              <p className="font-semibold text-destructive" role="alert">
                <Trans>Not enough USDC to renew</Trans>
              </p>
            )}
          </>
        )}
      </div>
      <div className="relative flex w-full flex-col gap-1 sm:w-auto">
        <MigrationUpgradeButton
          className="w-full pt-0 sm:w-80"
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
            recoveryAction={recoveryAction}
            totalSelected={totalSelected}
          />
        </MigrationUpgradeButton>
        {nftCopyEnabled && totalSelected > 0 && hasUnselectedEligibleNames && (
          <p className="flex items-center gap-1 text-ens-garnet-500 text-sm leading-[1.2] tracking-[0.14px]">
            <CircleAlert className="size-4 shrink-0" strokeWidth={1.8} />
            <Trans>Upgrade all names to receive NFT</Trans>
          </p>
        )}
      </div>
    </div>
  )
}
