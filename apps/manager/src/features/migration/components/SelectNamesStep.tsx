import { Trans, useLingui } from '@lingui/react/macro'
import { Check, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { match } from 'ts-pattern'
import { useV1Names } from '@/features/migration/hooks/useV1Names'
import { cn } from '@/lib/utils'
import { NameListSkeleton } from './NameListSkeleton'

type SelectNamesStepProps = {
  readonly onNamesChange: (names: string[]) => void
  readonly onNext: () => void
}

export const SelectNamesStep = ({
  onNamesChange,
  onNext,
}: SelectNamesStepProps) => {
  const { t } = useLingui()
  const { data: v1Names = [], isPending } = useV1Names()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const filtered = useMemo(
    () =>
      v1Names.filter((n) =>
        n.name.toLowerCase().includes(search.toLowerCase()),
      ),
    [search, v1Names],
  )

  const toggleName = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }

  // Sync selected names to parent after state settles (avoids setState-during-render)
  // biome-ignore lint/correctness/useExhaustiveDependencies: onNamesChange is stable from useCallback
  useEffect(() => {
    onNamesChange([...selected])
  }, [selected])

  const selectedCount = filtered.filter((n) => selected.has(n.name)).length

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
                  {match({ isPending, hasResults: filtered.length > 0 })
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
                    .otherwise(() =>
                      filtered.map((item) => {
                        const isSelected = selected.has(item.name)
                        return (
                          <button
                            className="flex cursor-pointer items-center gap-3"
                            key={item.id}
                            onClick={() => toggleName(item.name)}
                            type="button"
                          >
                            <div
                              className={cn(
                                'flex shrink-0 items-center justify-center rounded-[4px] p-1 transition-colors',
                                isSelected
                                  ? 'bg-ens-garnet-900'
                                  : 'border border-ens-garnet-900/30 bg-transparent',
                              )}
                            >
                              <Check
                                className={cn(
                                  'size-5 transition-opacity',
                                  isSelected
                                    ? 'text-white opacity-100'
                                    : 'text-transparent opacity-0',
                                )}
                                strokeWidth={2.5}
                              />
                            </div>
                            <div className="flex size-[37px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-ens-garnet-900/10">
                              <span className="font-semi-mono text-ens-garnet-900 text-xs">
                                {item.labelName?.[0]?.toUpperCase() ?? '?'}
                              </span>
                            </div>
                            <div className="rounded-[2px] border border-[#595755]/40 bg-white px-2 py-1 font-medium font-semi-mono text-[#595755] text-base leading-[0.96] tracking-[-0.32px]">
                              {item.name}
                            </div>
                          </button>
                        )
                      }),
                    )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-center justify-between gap-4 bg-[rgba(251,249,250,0.3)] px-8 py-8 sm:flex-row lg:px-[150px]">
        <p className="text-base text-ens-garnet-900 uppercase leading-[1.2] tracking-[0.16px]">
          <Trans>
            <span>{selectedCount}</span>
            <span className="font-semi-mono"> out of </span>
            <span>{filtered.length}</span>
            <span className="font-semi-mono"> eligible names selected</span>
          </Trans>
        </p>
        <button
          className="h-[46px] w-full min-w-[160px] rounded-[4px] bg-ens-garnet-900 px-[10px] text-[#fff6f9] text-sm uppercase tracking-[1.68px] shadow-[inset_0px_-3px_0px_0px_rgba(0,0,0,0.35)] disabled:opacity-50 sm:w-[320px]"
          disabled={selectedCount === 0 || isPending}
          onClick={onNext}
          type="button"
        >
          <Trans>Upgrade names</Trans>
        </button>
      </div>
    </div>
  )
}
