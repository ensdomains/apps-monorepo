import { Trans, useLingui } from '@lingui/react/macro'
import { Check, ChevronLeft, CircleAlert, Info, Search } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
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
} from './selectNames.helpers'

type SelectNamesStepProps = {
  readonly gasEstimate: MigrationGasEstimateState
  readonly onBack: () => void
  readonly onNamesChange: (names: string[]) => void
  readonly onNext: () => boolean | Promise<boolean>
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
      <span className="font-semi-mono uppercase">
        {' '}
        eligible names selected
      </span>
    </Trans>
  ) : (
    <Trans>
      <span>{totalSelected}</span>
      <span> out of </span>
      <span>{visibleCount}</span>
      <span className="font-semi-mono uppercase">
        {' '}
        eligible names selected
      </span>
    </Trans>
  )

export const SelectNamesStep = ({
  gasEstimate,
  onBack,
  onNamesChange,
  onNext,
}: SelectNamesStepProps) => {
  const { t } = useLingui()
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

  useEffect(() => {
    if (!showNameSearch && search !== '') setSearch('')
  }, [search, setSearch, showNameSearch])

  const handleUpgrade = useCallback(async () => {
    if (isUpgradeDisabled) return
    setIsStarting(true)
    try {
      const didStart = await onNext()
      if (!didStart) setIsStarting(false)
    } catch (error) {
      setIsStarting(false)
      throw error
    }
  }, [isUpgradeDisabled, onNext])

  return (
    <div className="relative z-10 flex h-full flex-col">
      <button
        className="absolute top-6 left-4 flex items-center gap-1 font-normal text-base text-ens-lapis-900 uppercase leading-[18px] tracking-[1.92px] transition-opacity hover:opacity-70 md:left-8"
        onClick={onBack}
        type="button"
      >
        <ChevronLeft className="size-5" strokeWidth={1.5} />
        <Trans>Back</Trans>
      </button>

      <div className="flex min-h-0 flex-1 flex-col items-center px-5 pt-11 pb-5">
        <div className="flex min-h-0 w-full max-w-[860px] flex-1 flex-col items-center gap-7">
          <h1 className="w-full shrink-0 text-center text-[36px] text-ens-garnet-900 leading-[1.1] tracking-[-0.72px]">
            <Trans>Your names are ready to upgrade</Trans>
          </h1>

          <div className="flex min-h-0 w-full max-w-[756px] flex-1 flex-col gap-4">
            {showNameSearch && (
              <div className="flex h-[42px] shrink-0 items-center gap-3 rounded-[20px] bg-white/40 px-4 py-1.5">
                <Search className="size-5 shrink-0 text-ens-garnet-900/40" />
                <input
                  aria-label={t`Search names`}
                  className="flex-1 bg-transparent text-base text-ens-garnet-900 leading-[0.96] tracking-[-0.32px] placeholder:text-ens-garnet-900/40 focus:outline-none"
                  disabled={isPending}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t`Search names`}
                  type="text"
                  value={search}
                />
              </div>
            )}

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[20px] bg-white/40 p-8">
              <div className="flex shrink-0 flex-col gap-2">
                <p className="text-base text-ens-garnet-900 leading-[1.2] tracking-[0.16px]">
                  <SelectedCountLabel
                    allSelected={allSelected}
                    totalSelected={totalSelected}
                    visibleCount={visibleCount}
                  />
                </p>
                <p className="flex items-center gap-1 text-ens-garnet-900/75 text-sm leading-[0.96] tracking-[-0.28px]">
                  <Info className="size-3.5 shrink-0" strokeWidth={1.8} />
                  <Trans>
                    Your names, text records, and addresses will migrate
                    automatically
                  </Trans>
                </p>
              </div>

              {showBulkSelection && (
                <button
                  aria-pressed={allSelected}
                  className="mt-3 flex shrink-0 items-center gap-2 self-start text-base text-ens-garnet-900 leading-[1.2] tracking-[0.16px]"
                  disabled={isPending}
                  onClick={toggleAll}
                  type="button"
                >
                  <span
                    className={cn(
                      'flex size-7 shrink-0 items-center justify-center rounded-full border p-1 transition-colors',
                      allSelected
                        ? 'border-ens-garnet-900 bg-transparent'
                        : 'border-ens-garnet-900/30 bg-transparent',
                    )}
                  >
                    <Check
                      className={cn(
                        'size-5 transition-opacity',
                        allSelected
                          ? 'text-ens-garnet-900 opacity-100'
                          : 'text-transparent opacity-0',
                      )}
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

              <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-3 [scrollbar-color:#f2b9d0_rgba(250,249,247,0.6)] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#f2b9d0] [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-[rgba(250,249,247,0.6)] [&::-webkit-scrollbar]:w-2">
                <div className="flex flex-col gap-4">
                  {match({
                    isPending,
                    hasResults:
                      filteredGroups.length > 0 || filteredOrphans.length > 0,
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
                              <Trans>
                                No eligible names found for this wallet
                              </Trans>
                            ))}
                        </p>
                      </div>
                    ))
                    .otherwise(() => [
                      ...filteredGroups.flatMap((group) => {
                        const parentName = group.parent.domain.name
                        const parentSelected = selected.has(parentName)
                        const subnameNames = group.subnames.map(
                          (s) => s.domain.name,
                        )
                        return [
                          <NameRow
                            indent={false}
                            interactive={true}
                            isSelected={parentSelected}
                            item={group.parent}
                            key={group.parent.domain.id}
                            onClick={() =>
                              toggleGroup(parentName, subnameNames)
                            }
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
                    ])}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex min-h-[115px] shrink-0 flex-col items-center justify-between gap-4 bg-[rgba(251,249,250,0.3)] px-8 py-8 sm:flex-row lg:px-[150px]">
        <div className="flex max-w-[430px] flex-col gap-1 text-ens-garnet-900/75 text-sm leading-[1.2] tracking-[-0.28px]">
          {totalSelected > 0
            ? match(gasEstimate)
                .with({ status: 'loading' }, () => (
                  <p>
                    <Trans>Estimating migration gas...</Trans>
                  </p>
                ))
                .with({ status: 'ready' }, (estimate) => (
                  <p>
                    <Trans>
                      Estimated network fee: ~{estimate.formattedEth} ETH across{' '}
                      {estimate.transactionCount} transactions. Final fee
                      confirmed in your wallet.
                    </Trans>
                  </p>
                ))
                .with({ status: 'error' }, () => (
                  <p>
                    <Trans>Gas estimate unavailable</Trans>
                  </p>
                ))
                .otherwise(() => null)
            : null}
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
            className="h-[46px] w-full min-w-40 overflow-hidden rounded-sm bg-ens-garnet-900 px-4 py-2.5 font-semi-mono text-ens-garnet-50 text-sm uppercase tracking-[1.68px] shadow-[inset_0px_-3px_0px_0px_rgba(0,0,0,0.35)] disabled:opacity-50 sm:w-[320px]"
            disabled={isUpgradeDisabled}
            onClick={handleUpgrade}
            type="button"
          >
            {isEstimatingGas ? (
              <Trans>Estimating...</Trans>
            ) : isStarting ? (
              <Trans>Starting...</Trans>
            ) : (
              <Trans>Upgrade {totalSelected} names</Trans>
            )}
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
