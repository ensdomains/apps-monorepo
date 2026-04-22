import { Trans, useLingui } from '@lingui/react/macro'
import { Info, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { match } from 'ts-pattern'
import { useEligibleV1Names } from '@/features/migration/hooks/useEligibleV1Names'
import type { ClassifiedName } from '../service/classifyNames'
import { groupByParent } from '../service/groupByParent'
import { NameListSkeleton } from './NameListSkeleton'
import { NameRow } from './NameRow'

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
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isStarting, setIsStarting] = useState(false)

  const eligibleList: readonly ClassifiedName[] = eligible

  const { groups, orphans } = useMemo(
    () => groupByParent(eligibleList),
    [eligibleList],
  )

  const didSeed = useRef(false)
  useEffect(() => {
    if (didSeed.current || isPending || eligibleList.length === 0) return
    didSeed.current = true
    const ready = new Set<string>()
    for (const group of groups) {
      ready.add(group.parent.domain.name)
      for (const sub of group.subnames) ready.add(sub.domain.name)
    }
    for (const orphan of orphans) ready.add(orphan.domain.name)
    setSelected(ready)
    onNamesChange([...ready])
  }, [isPending, eligibleList, groups, orphans, onNamesChange])

  const searchLower = search.toLowerCase()

  const filteredGroups = useMemo(() => {
    if (!searchLower) return groups
    return groups.filter(
      (g) =>
        g.parent.domain.name.toLowerCase().includes(searchLower) ||
        g.subnames.some((s) =>
          s.domain.name.toLowerCase().includes(searchLower),
        ),
    )
  }, [groups, searchLower])

  const filteredOrphans = useMemo(() => {
    if (!searchLower) return orphans
    return orphans.filter((o) =>
      o.domain.name.toLowerCase().includes(searchLower),
    )
  }, [orphans, searchLower])

  const toggleName = useCallback(
    (name: string) => {
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(name)) next.delete(name)
        else next.add(name)
        onNamesChange([...next])
        return next
      })
    },
    [onNamesChange],
  )

  const toggleGroup = useCallback(
    (parentName: string, subnameNames: readonly string[]) => {
      setSelected((prev) => {
        const next = new Set(prev)
        const hasParent = next.has(parentName)
        if (hasParent) {
          next.delete(parentName)
          for (const sub of subnameNames) next.delete(sub)
        } else {
          next.add(parentName)
          for (const sub of subnameNames) next.add(sub)
        }
        onNamesChange([...next])
        return next
      })
    },
    [onNamesChange],
  )

  const totalSelected = selected.size

  const visibleCount =
    groups.reduce((acc, g) => acc + 1 + g.subnames.length, 0) + orphans.length

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
                          ...group.subnames.map((sub) => (
                            <NameRow
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
        </div>
        <button
          className="h-[46px] w-full min-w-[160px] overflow-hidden rounded-sm bg-ens-garnet-900 px-4 py-2.5 font-semi-mono text-ens-garnet-50 text-sm uppercase tracking-[1.68px] shadow-[inset_0px_-3px_0px_0px_rgba(0,0,0,0.35)] disabled:opacity-50 sm:w-[320px]"
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
  )
}
