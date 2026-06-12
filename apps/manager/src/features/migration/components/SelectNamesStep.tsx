import { Plural, Trans, useLingui } from '@lingui/react/macro'
import { Check, ChevronLeft, CircleAlert, Info, Search } from 'lucide-react'
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useState,
} from 'react'
import { match } from 'ts-pattern'
import { useEligibleV1Names } from '@/features/migration/hooks/useEligibleV1Names'
import type { MigrationGasEstimateState } from '@/features/migration/hooks/useMigrationGasEstimate'
import { useNameSelection } from '@/features/migration/hooks/useNameSelection'
import { cn } from '@/lib/utils'
import { NameListSkeleton } from './NameListSkeleton'
import { NameRow } from './NameRow'
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

type StartUpgradeParams = {
  readonly isUpgradeDisabled: boolean
  readonly onNext: () => boolean | Promise<boolean>
  readonly setIsStarting: Dispatch<SetStateAction<boolean>>
}

const startUpgrade = async ({
  isUpgradeDisabled,
  onNext,
  setIsStarting,
}: StartUpgradeParams) => {
  if (isUpgradeDisabled) return
  setIsStarting(true)
  try {
    const didStart = await onNext()
    if (!didStart) setIsStarting(false)
  } catch (error) {
    setIsStarting(false)
    throw error
  }
}

const SelectedCountLabel = ({
  allSelected,
  totalSelected,
  visibleCount,
}: {
  readonly allSelected: boolean
  readonly totalSelected: number
  readonly visibleCount: number
}) =>
  allSelected ? (
    <Trans>
      <span>All </span>
      <span>{visibleCount}</span>
      <span className="font-semi-mono uppercase"> eligible names selected</span>
    </Trans>
  ) : (
    <Trans>
      <span>{totalSelected}</span>
      <span> out of </span>
      <span>{visibleCount}</span>
      <span className="font-semi-mono uppercase"> eligible names selected</span>
    </Trans>
  )

const GasEstimateMessage = ({
  gasEstimate,
  totalSelected,
}: {
  readonly gasEstimate: MigrationGasEstimateState
  readonly totalSelected: number
}) => {
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

const UpgradeButtonLabel = ({
  isEstimatingGas,
  isStarting,
  totalSelected,
}: {
  readonly isEstimatingGas: boolean
  readonly isStarting: boolean
  readonly totalSelected: number
}) => {
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

type NameListContentProps = Pick<
  ReturnType<typeof useNameSelection>,
  | 'filteredGroups'
  | 'filteredOrphans'
  | 'search'
  | 'selected'
  | 'toggleGroup'
  | 'toggleName'
> & {
  readonly isPending: boolean
}

const NameListContent = ({
  filteredGroups,
  filteredOrphans,
  isPending,
  search,
  selected,
  toggleGroup,
  toggleName,
}: NameListContentProps) =>
  match({
    isPending,
    hasResults: filteredGroups.length > 0 || filteredOrphans.length > 0,
  })
    .with({ isPending: true }, () => <NameListSkeleton />)
    .with({ hasResults: false }, () => (
      <div className="flex flex-col items-center gap-3 py-8">
        <p className="text-ens-garnet-900/40 text-sm">
          {match(search)
            .when(
              (s) => s.length > 0,
              () => <Trans>No names match your search</Trans>,
            )
            .otherwise(() => (
              <Trans>No eligible names found for this wallet</Trans>
            ))}
        </p>
      </div>
    ))
    .otherwise(() => [
      ...filteredGroups.flatMap((group) => {
        const parentName = group.parent.domain.name
        const parentSelected = selected.has(parentName)
        const subnameNames = group.subnames.map((s) => s.domain.name)
        return [
          <NameRow
            indent={false}
            interactive={true}
            isSelected={parentSelected}
            item={group.parent}
            key={group.parent.domain.id}
            onClick={() => toggleGroup(parentName, subnameNames)}
          />,
          ...group.subnames.map((sub, idx) => (
            <NameRow
              firstSubname={idx === 0}
              indent={true}
              interactive={false}
              isSelected={parentSelected}
              item={sub}
              key={sub.domain.id}
            />
          )),
        ]
      }),
      ...filteredOrphans.map((orphan) => (
        <NameRow
          indent={false}
          interactive={true}
          isSelected={selected.has(orphan.domain.name)}
          item={orphan}
          key={orphan.domain.id}
          onClick={() => toggleName(orphan.domain.name)}
        />
      )),
    ])

type SelectionOptionsProps = Pick<
  ReturnType<typeof useNameSelection>,
  | 'allSelected'
  | 'filteredGroups'
  | 'filteredOrphans'
  | 'search'
  | 'selected'
  | 'setSearch'
  | 'toggleAll'
  | 'toggleGroup'
  | 'toggleName'
  | 'totalSelected'
  | 'visibleCount'
> & {
  readonly isCompactLayout: boolean
  readonly isContentHeightCard: boolean
  readonly isPending: boolean
  readonly showBulkSelection: boolean
  readonly showNameSearch: boolean
}

const SelectionOptions = ({
  allSelected,
  filteredGroups,
  filteredOrphans,
  isCompactLayout,
  isContentHeightCard,
  isPending,
  search,
  selected,
  setSearch,
  showBulkSelection,
  showNameSearch,
  toggleAll,
  toggleGroup,
  toggleName,
  totalSelected,
  visibleCount,
}: SelectionOptionsProps) => {
  const { t } = useLingui()

  return (
    <div
      className={cn(
        'flex min-h-0 w-full max-w-189 flex-1 flex-col gap-4',
        isContentHeightCard && 'md:flex-none',
      )}
    >
      {showNameSearch && (
        <div className="flex h-8 shrink-0 items-center gap-3.25 rounded-[30px] bg-white/80 px-[6.5px] py-1.5 md:h-10.5 md:gap-3 md:rounded-[20px] md:bg-white/40 md:px-4">
          <Search className="size-4 shrink-0 text-ens-garnet-900/40" />
          <input
            aria-label={t`Search names`}
            className="flex-1 bg-transparent text-ens-garnet-900 text-sm leading-[0.96] tracking-[-0.28px] placeholder:text-ens-garnet-900/40 focus:outline-none md:text-base md:tracking-[-0.32px]"
            disabled={isPending}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t`Search names`}
            type="text"
            value={search}
          />
        </div>
      )}

      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col overflow-hidden rounded-none bg-transparent p-0 md:rounded-[20px] md:border md:border-white md:bg-[rgba(254,234,240,0.72)]',
          isCompactLayout ? 'md:p-6' : 'md:p-12',
          isContentHeightCard && 'md:flex-none',
        )}
      >
        <div className="flex shrink-0 flex-col gap-2">
          <div className="flex items-center gap-2 text-ens-garnet-900 text-sm leading-[1.2] tracking-[0.14px] md:text-base md:tracking-[0.16px]">
            <Check className="size-5 shrink-0 md:hidden" strokeWidth={1.8} />
            <p>
              <SelectedCountLabel
                allSelected={allSelected}
                totalSelected={totalSelected}
                visibleCount={visibleCount}
              />
            </p>
          </div>
          <p className="flex items-start gap-1 text-ens-garnet-900/70 text-xs leading-normal tracking-[-0.24px] md:items-center md:text-sm md:leading-[0.96] md:tracking-[-0.28px]">
            <Info
              className="mt-0.5 size-3.5 shrink-0 md:mt-0"
              strokeWidth={1.8}
            />
            <Trans>
              Your names, text records, and addresses will migrate automatically
            </Trans>
          </p>
        </div>

        {showBulkSelection && (
          <button
            aria-pressed={allSelected}
            className="mt-4 flex shrink-0 items-center gap-2 self-start text-ens-garnet-900 text-sm leading-[1.2] tracking-[0.14px] md:mt-3 md:text-base md:tracking-[0.16px]"
            disabled={isPending}
            onClick={toggleAll}
            type="button"
          >
            <span
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full border border-ens-garnet-900 bg-transparent p-1 transition-colors',
                isPending && 'opacity-50',
              )}
            >
              <Check
                className="size-5 text-ens-garnet-900"
                strokeWidth={2.25}
              />
            </span>
            {allSelected ? (
              <Trans>Deselect all</Trans>
            ) : (
              <Trans>Select all</Trans>
            )}
          </button>
        )}

        <div
          className={cn(
            'min-h-0 flex-1 overflow-y-auto pr-3 [scrollbar-color:#f2b9d0_rgba(250,249,247,0.45)] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#f2b9d0] [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-[rgba(250,249,247,0.45)] [&::-webkit-scrollbar]:w-2',
            isCompactLayout ? 'mt-4' : 'mt-8',
            isContentHeightCard && 'md:flex-none md:overflow-visible',
          )}
        >
          <div className="flex flex-col gap-4">
            <NameListContent
              filteredGroups={filteredGroups}
              filteredOrphans={filteredOrphans}
              isPending={isPending}
              search={search}
              selected={selected}
              toggleGroup={toggleGroup}
              toggleName={toggleName}
            />
          </div>
        </div>
      </div>
    </div>
  )
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

          <SelectionOptions
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

      <div className="flex min-h-36 shrink-0 flex-col items-stretch justify-start gap-4 bg-[rgba(251,249,250,0.3)] px-5 pt-4 pb-14 sm:min-h-28.75 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-8 lg:px-[150px]">
        <div className="flex max-w-107.5 flex-col gap-1 text-ens-garnet-900/75 text-xs leading-normal tracking-[-0.24px] sm:text-sm sm:leading-[1.2] sm:tracking-[-0.28px]">
          <GasEstimateMessage
            gasEstimate={gasEstimate}
            totalSelected={totalSelected}
          />
          {totalSelected > 100 && (
            <p>
              <Trans>
                This will be split into {Math.ceil(totalSelected / 100)} batches
                — expect that many wallet signatures (plus approvals).
              </Trans>
            </p>
          )}
        </div>
        <div className="flex w-full flex-col gap-1 sm:w-auto">
          <button
            className="h-11.5 w-full min-w-40 overflow-hidden rounded-sm bg-ens-garnet-900 px-4 py-2.5 font-semi-mono text-ens-garnet-50 text-sm uppercase tracking-[1.68px] shadow-[inset_0px_-3px_0px_0px_rgba(0,0,0,0.35)] disabled:opacity-50 sm:w-[320px]"
            disabled={isUpgradeDisabled}
            onClick={handleUpgrade}
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
    </div>
  )
}
