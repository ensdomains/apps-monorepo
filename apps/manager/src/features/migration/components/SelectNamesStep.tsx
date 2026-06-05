import { Trans, useLingui } from '@lingui/react/macro'
import { Info, Search } from 'lucide-react'
import { useCallback, useState } from 'react'
import { match } from 'ts-pattern'
import { useEligibleV1Names } from '@/features/migration/hooks/useEligibleV1Names'
import { useNameSelection } from '@/features/migration/hooks/useNameSelection'
import { NameListSkeleton } from './NameListSkeleton'
import { NameRow } from './NameRow'
import { shouldShowDeselectAll } from './selectNames.helpers'

type SelectNamesStepProps = {
  readonly onNamesChange: (names: string[]) => void
  readonly onNext: () => void | Promise<void>
}

export const SelectNamesStep = ({
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
    filteredGroups,
    filteredOrphans,
    toggleName,
    toggleGroup,
    deselectAll,
  } = useNameSelection({ eligible, isPending, onNamesChange })

  const showDeselectAll = shouldShowDeselectAll(visibleCount)

  const handleUpgrade = useCallback(async () => {
    if (isStarting) return
    setIsStarting(true)
    try {
      await onNext()
    } catch (error) {
      setIsStarting(false)
      throw error
    }
  }, [isStarting, onNext])

  return (
    <div className="relative z-10 flex h-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col items-center px-5 pt-8 pb-4">
        <div className="flex min-h-0 w-full max-w-[860px] flex-1 flex-col items-center gap-8">
          <h1 className="w-full shrink-0 text-center text-[36px] text-ens-garnet-900 leading-[1.1] tracking-[-0.72px]">
            <Trans>Your names are ready to upgrade</Trans>
          </h1>

          <div className="flex min-h-0 w-full max-w-[756px] flex-1 flex-col gap-4">
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

            <div className="min-h-0 flex-1 overflow-hidden rounded-[20px] bg-white/40">
              <div className="h-full overflow-y-auto p-6 md:p-[42px] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-ens-garnet-dust [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-[rgba(250,249,247,0.6)] [&::-webkit-scrollbar]:w-2">
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

      <div className="flex shrink-0 flex-col items-center justify-between gap-4 bg-[rgba(251,249,250,0.3)] px-8 py-8 sm:flex-row lg:px-[150px]">
        <div className="flex flex-col gap-1">
          <p className="text-base text-ens-garnet-900 uppercase leading-[1.2] tracking-[0.16px]">
            <Trans>
              <span>{totalSelected}</span>
              <span className="font-semi-mono"> of </span>
              <span>{visibleCount}</span>
              <span className="font-semi-mono">
                {' '}
                total eligible names selected
              </span>
            </Trans>
          </p>
          {totalSelected > 0 && (
            <p className="flex items-center gap-1 text-ens-garnet-900/50 text-xs">
              <Info className="size-3 shrink-0" />
              <Trans>
                Your text records and addresses will be migrated automatically.
              </Trans>
            </p>
          )}
          {totalSelected > 100 && (
            <p className="flex items-center gap-1 text-ens-garnet-900/50 text-xs">
              <Info className="size-3 shrink-0" />
              <Trans>
                This will be split into {Math.ceil(totalSelected / 100)} batches
                — expect that many wallet signatures (plus approvals).
              </Trans>
            </p>
          )}
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          {showDeselectAll && (
            <button
              className="h-[46px] w-full min-w-40 rounded-sm bg-ens-garnet-900/10 px-4 py-2.5 font-semi-mono text-ens-garnet-900 text-sm uppercase tracking-[1.68px] disabled:opacity-50 sm:w-[200px]"
              disabled={totalSelected === 0 || isPending || isStarting}
              onClick={deselectAll}
              type="button"
            >
              <Trans>Deselect all</Trans>
            </button>
          )}
          <button
            className="h-[46px] w-full min-w-40 overflow-hidden rounded-sm bg-ens-garnet-900 px-4 py-2.5 font-semi-mono text-ens-garnet-50 text-sm uppercase tracking-[1.68px] shadow-[inset_0px_-3px_0px_0px_rgba(0,0,0,0.35)] disabled:opacity-50 sm:w-[320px]"
            disabled={totalSelected === 0 || isPending || isStarting}
            onClick={handleUpgrade}
            type="button"
          >
            {isStarting ? (
              <Trans>Preparing...</Trans>
            ) : (
              <Trans>Upgrade Names</Trans>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
