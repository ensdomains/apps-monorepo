import type { GasAffordability } from '@ens-apps/utils/gasAffordability'
import { Trans } from '@lingui/react/macro'
import { CircleAlert } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useEligibleV1Names } from '@/features/migration/hooks/useEligibleV1Names'
import type { MigrationGasEstimateState } from '@/features/migration/hooks/useMigrationGasEstimate'
import type { MigrationGasFundingStatus } from '@/features/migration/hooks/useMigrationGasFunding'
import { useNameSelection } from '@/features/migration/hooks/useNameSelection'
import { cn } from '@/lib/utils'
import { MigrationAiSelectionNotice } from './MigrationAiSelectionNotice'
import {
  getMigrationAiProposal,
  type MigrationAiPreset,
} from './migrationAiPreset'
import { startUpgrade } from './SelectNamesStep.handlers'
import { SelectNamesStepFooter } from './SelectNamesStepFooter'
import { SelectNamesStepSelectionOptions } from './SelectNamesStepSelectionOptions'
import {
  shouldShowBulkSelection,
  shouldShowNameSearch,
  shouldUseCompactSelectionLayout,
  shouldUseSmallSelectionCard,
} from './selectNames.helpers'

type SelectNamesStepProps = {
  readonly gasEstimate: MigrationGasEstimateState
  readonly gasAffordability: GasAffordability
  readonly gasFundingStatus: MigrationGasFundingStatus
  readonly onNamesChange: (names: string[]) => void
  readonly onNext: () => boolean | Promise<boolean>
  readonly preset?: MigrationAiPreset
  readonly names?: readonly string[]
}

const getSelectionSpacing = (contentHeight: boolean, compact: boolean) =>
  contentHeight
    ? 'md:justify-center md:pt-0 md:pb-0'
    : compact
      ? 'md:pt-6'
      : 'md:pt-16'

export const SelectNamesStep = ({
  gasEstimate,
  gasAffordability,
  gasFundingStatus,
  onNamesChange,
  onNext,
  preset,
  names,
}: SelectNamesStepProps) => {
  const isAiPreset = preset !== undefined || names !== undefined
  const { eligible, isPending, isError, recoveryState } = useEligibleV1Names({
    fallbackToClassified: !isAiPreset,
    requireFresh: isAiPreset,
  })
  const [isStarting, setIsStarting] = useState(false)
  const isRecoveryStale = recoveryState.status === 'stale'
  const isRecovering = recoveryState.status === 'recovering'
  const { requestedProposal, dependencyConflicts } = getMigrationAiProposal(
    eligible,
    names,
    preset,
    isRecovering,
  )
  const hasNamesNeedingManagerRestoration = eligible.some(
    ({ managerAddress }) => managerAddress !== null,
  )

  const {
    search,
    setSearch,
    selected,
    totalSelected,
    visibleCount,
    allSelected,
    filteredGroups,
    filteredOrphans,
    toggleName,
    toggleAll,
  } = useNameSelection({
    eligible,
    isPending,
    isRecovery: isRecovering,
    preset,
    names,
    onNamesChange,
  })

  const isEstimatingGas = totalSelected > 0 && gasEstimate.status === 'loading'
  const isWaitingForGasEstimate =
    totalSelected > 0 && gasEstimate.status !== 'ready'
  // The gas drip request only resolves once any sepETH top-up is confirmed
  // on-chain, so block "Upgrade" until then — otherwise the owner can start a
  // migration that fails for lack of gas before the ETH has landed.
  const isWaitingForGasFunding =
    totalSelected > 0 && gasFundingStatus === 'funding'
  const isUpgradeDisabled =
    totalSelected === 0 ||
    isPending ||
    isError ||
    isRecoveryStale ||
    isStarting ||
    isWaitingForGasEstimate ||
    isWaitingForGasFunding
  const showBulkSelection = shouldShowBulkSelection(visibleCount)
  const showNameSearch = shouldShowNameSearch(visibleCount)
  const isCompactLayout = shouldUseCompactSelectionLayout(visibleCount)
  const isSmallSelectionCard =
    !isPending && shouldUseSmallSelectionCard(visibleCount)
  const isContentHeightCard = isPending || isSmallSelectionCard
  const isCompactOuterSpacing =
    isCompactLayout || isPending || visibleCount === 0

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
          getSelectionSpacing(isContentHeightCard, isCompactOuterSpacing),
        )}
      >
        <div
          className={cn(
            'flex min-h-0 w-full max-w-215 flex-1 flex-col items-center gap-6 md:gap-7',
            isContentHeightCard && 'md:flex-none',
          )}
        >
          <h1 className="w-full shrink-0 text-left text-[32px] text-ens-garnet-900 leading-[1.1] tracking-[-0.64px] md:text-center md:text-[36px] md:tracking-[-0.72px]">
            {isRecoveryStale ? (
              <Trans>Your saved upgrade needs attention</Trans>
            ) : (
              <Trans>Your names are ready to upgrade</Trans>
            )}
          </h1>

          {hasNamesNeedingManagerRestoration && !isRecoveryStale && (
            <p className="max-w-160 text-ens-garnet-900/75 text-sm leading-5 md:text-center">
              <Trans>
                Names with a different manager start unselected. Selecting one
                requires temporary permission for your smart account to manage
                your names. We remove that permission after the upgrade.
              </Trans>
            </p>
          )}

          {isAiPreset && isError && (
            <div
              className="flex w-full max-w-160 items-start gap-3 rounded-lg bg-ens-garnet-50/70 px-4 py-4 text-ens-garnet-900"
              role="alert"
            >
              <CircleAlert
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0"
              />
              <p className="text-sm leading-5">
                <Trans>
                  We couldn&apos;t refresh your upgrade eligibility. Reload this
                  page before choosing names.
                </Trans>
              </p>
            </div>
          )}

          {isAiPreset && isRecovering && !isPending && (
            <div
              className="flex w-full max-w-160 items-start gap-3 rounded-lg bg-ens-garnet-50/70 px-4 py-4 text-ens-garnet-900"
              role="status"
            >
              <CircleAlert
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0"
              />
              <p className="text-sm leading-5">
                <Trans>
                  Your unfinished upgrade is being restored. Its saved selection
                  takes priority over the new request.
                </Trans>
              </p>
            </div>
          )}

          <MigrationAiSelectionNotice
            dependencyConflicts={dependencyConflicts}
            isPending={isPending}
            requestedProposal={requestedProposal}
          />

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
        totalSelected={totalSelected}
        visibleCount={visibleCount}
      />
    </div>
  )
}
