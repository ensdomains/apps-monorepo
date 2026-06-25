import { Trans } from '@lingui/react/macro'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useEligibleV1Names } from '@/features/migration/hooks/useEligibleV1Names'
import type { MigrationGasEstimateState } from '@/features/migration/hooks/useMigrationGasEstimate'
import type { MigrationGasFundingStatus } from '@/features/migration/hooks/useMigrationGasFunding'
import { useNameSelection } from '@/features/migration/hooks/useNameSelection'
import { cn } from '@/lib/utils'
import { startSelectNamesAction } from './SelectNamesStep.handlers'
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
  readonly gasFundingStatus: MigrationGasFundingStatus
  readonly initialSelectedNames?: readonly string[]
  readonly onNamesChange: (names: string[]) => void
  readonly onRenewGrace: (names: string[]) => boolean | Promise<boolean>
  readonly onNext: () => boolean | Promise<boolean>
}

export const SelectNamesStep = ({
  gasEstimate,
  gasFundingStatus,
  initialSelectedNames,
  onNamesChange,
  onRenewGrace,
  onNext,
}: SelectNamesStepProps) => {
  const { eligible, renewableGrace = [], isPending } = useEligibleV1Names()
  const [isStarting, setIsStarting] = useState(false)
  const selectableNames = useMemo(
    () => [...eligible, ...renewableGrace],
    [eligible, renewableGrace],
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
    toggleGroup,
    toggleAll,
  } = useNameSelection({
    eligible: selectableNames,
    initialSelectedNames,
    isPending,
    onNamesChange,
  })
  const selectedGraceNames = useMemo(
    () =>
      renewableGrace
        .filter((name) => selected.has(name.domain.name))
        .map((name) => name.domain.name),
    [renewableGrace, selected],
  )
  const hasSelectedGraceNames = selectedGraceNames.length > 0

  const isEstimatingGas =
    totalSelected > 0 &&
    !hasSelectedGraceNames &&
    gasEstimate.status === 'loading'
  const isWaitingForGasEstimate =
    totalSelected > 0 &&
    !hasSelectedGraceNames &&
    gasEstimate.status !== 'ready'
  // The gas drip request only resolves once any sepETH top-up is confirmed
  // on-chain, so block "Upgrade" until then — otherwise the owner can start a
  // migration that fails for lack of gas before the ETH has landed.
  const isWaitingForGasFunding =
    totalSelected > 0 &&
    !hasSelectedGraceNames &&
    gasFundingStatus === 'funding'
  const isUpgradeDisabled =
    totalSelected === 0 ||
    isPending ||
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
    () =>
      startSelectNamesAction({
        isDisabled: isUpgradeDisabled,
        onRenewGrace,
        onUpgrade: onNext,
        selectedGraceNames,
        setIsStarting,
      }),
    [isUpgradeDisabled, onNext, onRenewGrace, selectedGraceNames],
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
            <Trans>Your names are ready to upgrade</Trans>
          </h1>

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
            toggleGroup={toggleGroup}
            toggleName={toggleName}
            totalSelected={totalSelected}
            visibleCount={visibleCount}
          />
        </div>
      </div>

      <SelectNamesStepFooter
        gasEstimate={gasEstimate}
        isEstimatingGas={isEstimatingGas}
        isStarting={isStarting}
        isUpgradeDisabled={isUpgradeDisabled}
        isWaitingForGasFunding={isWaitingForGasFunding}
        onUpgrade={handleUpgrade}
        selectedGraceCount={selectedGraceNames.length}
        totalSelected={totalSelected}
        visibleCount={visibleCount}
      />
    </div>
  )
}
