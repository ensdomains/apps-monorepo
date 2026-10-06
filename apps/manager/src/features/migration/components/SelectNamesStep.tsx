import type { GasAffordability } from '@ens-apps/utils/gasAffordability'
import { Trans } from '@lingui/react/macro'
import { CircleAlert } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useEligibleV1Names } from '@/features/migration/hooks/useEligibleV1Names'
import type { MigrationGasEstimateState } from '@/features/migration/hooks/useMigrationGasEstimate'
import type { MigrationGasFundingStatus } from '@/features/migration/hooks/useMigrationGasFunding'
import { useNameSelection } from '@/features/migration/hooks/useNameSelection'
import { cn } from '@/lib/utils'
import type { GraceRenewalGasEstimateState } from '../hooks/useGraceRenewalGasEstimate'
import type { GraceRenewalQuoteState } from '../hooks/useGraceRenewalQuote'
import { startUpgrade } from './SelectNamesStep.handlers'
import { SelectNamesStepFooter } from './SelectNamesStepFooter'
import { SelectNamesStepSelectionOptions } from './SelectNamesStepSelectionOptions'
import {
  shouldShowBulkSelection,
  shouldShowNameSearch,
  shouldUseCompactSelectionLayout,
  shouldUseSmallSelectionCard,
} from './selectNames.helpers'
import { UnavailableMigrationNames } from './UnavailableMigrationNames'

type SelectNamesStepProps = {
  readonly gasEstimate: MigrationGasEstimateState
  readonly gasAffordability: GasAffordability
  readonly gasFundingStatus: MigrationGasFundingStatus
  readonly onNamesChange: (names: string[]) => void
  readonly onNext: () => boolean | Promise<boolean>
  readonly renewal?: GraceRenewalQuoteState
  readonly renewalGasEstimate?: GraceRenewalGasEstimateState
}

const SelectionTitle = ({
  eligibleCount,
  graceCount,
  unavailableCount,
  isRecoveryStale,
}: {
  readonly eligibleCount: number
  readonly graceCount: number
  readonly unavailableCount: number
  readonly isRecoveryStale: boolean
}) => {
  if (isRecoveryStale) return <Trans>Your saved upgrade needs attention</Trans>
  if (eligibleCount === 0 && graceCount > 0) {
    return <Trans>Renew your names before upgrading</Trans>
  }
  if (eligibleCount === 0 && unavailableCount > 0)
    return <Trans>Your names cannot be upgraded yet</Trans>
  return <Trans>Your names are ready to upgrade</Trans>
}

export const SelectNamesStep = ({
  gasEstimate,
  gasAffordability,
  gasFundingStatus,
  onNamesChange,
  onNext,
  renewal = { status: 'idle' },
  renewalGasEstimate = { status: 'idle' },
}: SelectNamesStepProps) => {
  const {
    eligible,
    gracePeriodNames,
    unavailableNames = [],
    isPending,
    recoveryState,
  } = useEligibleV1Names()
  const [isStarting, setIsStarting] = useState(false)
  const isRecoveryStale = recoveryState.status === 'stale'
  const hasNamesNeedingManagerRestoration = eligible.some(
    ({ managerAddress }) => managerAddress !== null,
  )

  const {
    search,
    setSearch,
    selected,
    totalSelected,
    visibleCount,
    displayedCount,
    allSelected,
    filteredGroups,
    filteredOrphans,
    filteredGracePeriodNames,
    toggleName,
    toggleAll,
  } = useNameSelection({
    eligible,
    gracePeriodNames,
    isPending,
    isRecovery: recoveryState.status === 'recovering',
    onNamesChange,
  })

  const needsRenewal = renewal.status !== 'idle'
  const isEstimatingGas = needsRenewal
    ? renewalGasEstimate.status === 'loading'
    : gasEstimate.status === 'loading'
  const isWaitingForGasEstimate =
    totalSelected > 0 &&
    (needsRenewal
      ? renewal.status !== 'ready' ||
        renewalGasEstimate.status !== 'ready' ||
        renewal.quote.balance < renewal.quote.totalAmount
      : gasEstimate.status !== 'ready')
  // The gas drip request only resolves once any sepETH top-up is confirmed
  // on-chain, so block "Upgrade" until then — otherwise the owner can start a
  // migration that fails for lack of gas before the ETH has landed.
  const isWaitingForGasFunding =
    totalSelected > 0 && gasFundingStatus === 'funding'
  const isUpgradeDisabled =
    totalSelected === 0 ||
    isPending ||
    isRecoveryStale ||
    isStarting ||
    isWaitingForGasEstimate ||
    isWaitingForGasFunding
  const showBulkSelection = shouldShowBulkSelection(visibleCount)
  const showNameSearch = shouldShowNameSearch(displayedCount)
  const isCompactLayout = shouldUseCompactSelectionLayout(displayedCount)
  const isSmallSelectionCard =
    !isPending && shouldUseSmallSelectionCard(displayedCount)
  const isContentHeightCard = isPending || isSmallSelectionCard
  const isCompactOuterSpacing =
    isCompactLayout || isPending || displayedCount === 0

  useEffect(() => {
    if (!showNameSearch && search !== '') setSearch('')
  }, [search, setSearch, showNameSearch])

  const handleUpgrade = useCallback(
    () => startUpgrade({ isUpgradeDisabled, onNext, setIsStarting }),
    [isUpgradeDisabled, onNext],
  )

  return (
    <div className="relative z-10 flex min-h-0 w-full flex-1 flex-col self-stretch">
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col items-center px-5 pt-6 pb-0 md:pb-5',
          isContentHeightCard
            ? 'md:justify-center md:pt-0 md:pb-0'
            : isCompactOuterSpacing
              ? 'md:pt-6'
              : 'md:pt-16',
        )}
      >
        <div
          className={cn(
            'flex min-h-0 w-full max-w-215 flex-1 flex-col items-center gap-6 md:gap-7',
            isContentHeightCard && 'md:flex-none',
          )}
        >
          <h1 className="w-full shrink-0 text-left text-[32px] text-ens-garnet-900 leading-[1.1] tracking-[-0.64px] md:text-center md:text-[36px] md:tracking-[-0.72px]">
            <SelectionTitle
              eligibleCount={eligible.length}
              graceCount={gracePeriodNames.length}
              isRecoveryStale={isRecoveryStale}
              unavailableCount={unavailableNames.length}
            />
          </h1>

          <UnavailableMigrationNames names={unavailableNames} />

          {hasNamesNeedingManagerRestoration && !isRecoveryStale && (
            <p className="max-w-160 text-ens-garnet-900/75 text-sm leading-5 md:text-center">
              <Trans>
                Upgrading names with a different manager requires temporary
                permission for your smart account to manage your names. We
                remove that permission after the upgrade.
              </Trans>
            </p>
          )}

          {isRecoveryStale ? (
            <div
              className="flex w-full max-w-160 items-start gap-3 rounded-lg bg-ens-garnet-50/70 px-4 py-4 text-ens-garnet-900"
              role="alert"
            >
              <CircleAlert
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0"
              />
              <div className="flex flex-col gap-1 text-sm leading-5">
                <p>
                  <Trans>
                    Something about your names changed since you last tried, so
                    we can&apos;t safely pick up where you left off.
                  </Trans>
                </p>
                <p className="text-ens-garnet-500">
                  <Trans>
                    Nothing has been lost. Contact ENS support before trying
                    again.
                  </Trans>
                </p>
              </div>
            </div>
          ) : (
            <SelectNamesStepSelectionOptions
              allSelected={allSelected}
              filteredGracePeriodNames={filteredGracePeriodNames}
              filteredGroups={filteredGroups}
              filteredOrphans={filteredOrphans}
              isCompactLayout={isCompactLayout}
              isContentHeightCard={isContentHeightCard}
              isPending={isPending}
              search={search}
              selected={selected}
              setSearch={setSearch}
              showBulkSelection={showBulkSelection}
              showNameSearch={showNameSearch}
              toggleAll={toggleAll}
              toggleName={toggleName}
              totalSelected={totalSelected}
              visibleCount={visibleCount}
            />
          )}
        </div>
      </div>

      <SelectNamesStepFooter
        gasAffordability={gasAffordability}
        gasEstimate={gasEstimate}
        isEstimatingGas={isEstimatingGas}
        isStarting={isStarting}
        isUpgradeDisabled={isUpgradeDisabled}
        isWaitingForGasFunding={isWaitingForGasFunding}
        onUpgrade={handleUpgrade}
        renewal={renewal}
        renewalGasEstimate={renewalGasEstimate}
        totalSelected={totalSelected}
        visibleCount={visibleCount}
      />
    </div>
  )
}
