import { Trans } from '@lingui/react/macro'
import { ChevronLeft } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useEligibleV1Names } from '@/features/migration/hooks/useEligibleV1Names'
import type { MigrationGasEstimateState } from '@/features/migration/hooks/useMigrationGasEstimate'
import { useNameSelection } from '@/features/migration/hooks/useNameSelection'
import { cn } from '@/lib/utils'
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
  readonly onBack: () => void
  readonly onNamesChange: (names: string[]) => void
  readonly onNext: () => boolean | Promise<boolean>
}

export const SelectNamesStep = ({
  gasEstimate,
  onBack,
  onNamesChange,
  onNext,
}: SelectNamesStepProps) => {
  const { eligible, isPending } = useEligibleV1Names()
  const [isStarting, setIsStarting] = useState(false)

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
  } = useNameSelection({ eligible, isPending, onNamesChange })

  const isEstimatingGas = totalSelected > 0 && gasEstimate.status === 'loading'
  const isWaitingForGasEstimate =
    totalSelected > 0 && gasEstimate.status !== 'ready'
  const isUpgradeDisabled =
    totalSelected === 0 || isPending || isStarting || isWaitingForGasEstimate
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
    <div className="relative z-10 flex h-full flex-col">
      <button
        className="relative mt-4 ml-5 flex shrink-0 items-center gap-1 self-start font-normal text-ens-lapis-900 text-sm uppercase leading-4.5 tracking-[1.68px] transition-opacity hover:opacity-70 md:absolute md:top-6 md:left-8 md:mt-0 md:ml-0 md:text-base md:tracking-[1.92px]"
        onClick={onBack}
        type="button"
      >
        <ChevronLeft className="size-5" strokeWidth={1.5} />
        <Trans>Back</Trans>
      </button>

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
        onUpgrade={handleUpgrade}
        totalSelected={totalSelected}
        visibleCount={visibleCount}
      />
    </div>
  )
}
