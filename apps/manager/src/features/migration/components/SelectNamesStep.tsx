import { Trans, useLingui } from '@lingui/react/macro'
import { AlertTriangle, Check, Info, Search, X } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { useV1Names } from '@/features/migration/hooks/useV1Names'
import {
  classifyNames,
  type IneligibleName,
} from '@/features/migration/service/classifyNames'
import type {
  CustomNameSeed,
  CustomTokenType,
} from '@/features/migration/service/syntheticDomain'
import type { V1Domain } from '@/features/migration/service/v1SubgraphClient'
import { useSmartAccountContext } from '@/lib/smart-account'
import { cn } from '@/lib/utils'
import { NameListSkeleton } from './NameListSkeleton'

type SelectNamesStepProps = {
  readonly onNamesChange: (names: string[]) => void
  readonly onNext: () => void
  readonly customDomains: readonly V1Domain[]
  readonly onAddCustomName: (seed: CustomNameSeed) => void
  readonly onRemoveCustomName: (name: string) => void
}

export const SelectNamesStep = ({
  onNamesChange,
  onNext,
  customDomains,
  onAddCustomName,
  onRemoveCustomName,
}: SelectNamesStepProps) => {
  const { t } = useLingui()
  const { data: v1Names = [], isPending } = useV1Names()
  const { ownerAddress } = useSmartAccountContext()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [customNameInput, setCustomNameInput] = useState('')
  const [customTokenType, setCustomTokenType] =
    useState<CustomTokenType>('unlocked')
  const [customError, setCustomError] = useState<string | null>(null)

  const customNameSet = useMemo(
    () => new Set(customDomains.map((d) => d.name)),
    [customDomains],
  )

  const { eligibleNames, ineligibleNames } = useMemo(() => {
    if (!ownerAddress || v1Names.length === 0) {
      return {
        eligibleNames: [...v1Names, ...customDomains],
        ineligibleNames: [] as IneligibleName[],
      }
    }
    const { classified, ineligible } = classifyNames(
      v1Names,
      ownerAddress as Address,
    )
    return {
      eligibleNames: [...classified.map((c) => c.domain), ...customDomains],
      ineligibleNames: ineligible,
    }
  }, [v1Names, customDomains, ownerAddress])

  const filtered = useMemo(
    () =>
      eligibleNames.filter((n) =>
        n.name.toLowerCase().includes(search.toLowerCase()),
      ),
    [search, eligibleNames],
  )

  const filteredIneligible = useMemo(
    () =>
      ineligibleNames.filter((n) =>
        n.domain.name.toLowerCase().includes(search.toLowerCase()),
      ),
    [search, ineligibleNames],
  )

  const toggleName = useCallback(
    (name: string) => {
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(name)) {
          next.delete(name)
        } else {
          next.add(name)
        }
        onNamesChange([...next])
        return next
      })
    },
    [onNamesChange],
  )

  const handleAddCustomName = useCallback(() => {
    const rawInput = customNameInput.trim().toLowerCase()
    if (!rawInput) return
    setCustomError(null)
    if (!ownerAddress) {
      setCustomError('Connect wallet first')
      return
    }
    const name = rawInput.includes('.') ? rawInput : `${rawInput}.eth`
    if (
      v1Names.some((d) => d.name === name) ||
      customDomains.some((d) => d.name === name)
    ) {
      setCustomError('Name already in the list')
      return
    }
    try {
      onAddCustomName({ name, tokenType: customTokenType })
      setSelected((prev) => {
        const next = new Set(prev).add(name)
        onNamesChange([...next])
        return next
      })
      setCustomNameInput('')
    } catch (err) {
      setCustomError(err instanceof Error ? err.message : 'Failed to add')
    }
  }, [
    customNameInput,
    customTokenType,
    ownerAddress,
    v1Names,
    customDomains,
    onAddCustomName,
    onNamesChange,
  ])

  const handleRemoveCustomName = useCallback(
    (name: string) => {
      onRemoveCustomName(name)
      setSelected((prev) => {
        if (!prev.has(name)) return prev
        const next = new Set(prev)
        next.delete(name)
        onNamesChange([...next])
        return next
      })
    },
    [onRemoveCustomName, onNamesChange],
  )

  const totalSelected = selected.size

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

            {/* TEMP: dev-only custom name input — remove before prod */}
            <div className="flex shrink-0 flex-col gap-1">
              <div className="flex h-[42px] items-center gap-2 rounded-[20px] border border-ens-garnet-900/30 border-dashed bg-white/40 px-4 py-1.5">
                <input
                  aria-label="Custom name"
                  className="flex-1 bg-transparent text-base text-ens-garnet-900 leading-[0.96] tracking-[-0.32px] placeholder:text-ens-garnet-900/40 focus:outline-none"
                  onChange={(e) => {
                    setCustomNameInput(e.target.value)
                    setCustomError(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddCustomName()
                    }
                  }}
                  placeholder="Custom name (e.g. foo, .eth auto-appended) — dev only"
                  type="text"
                  value={customNameInput}
                />
                <select
                  aria-label="Custom name token type"
                  className="rounded-[8px] bg-white/60 px-2 py-1 font-semi-mono text-ens-garnet-900 text-xs"
                  onChange={(e) =>
                    setCustomTokenType(e.target.value as CustomTokenType)
                  }
                  value={customTokenType}
                >
                  <option value="unwrapped">unwrapped</option>
                  <option value="unlocked">unlocked</option>
                  <option value="locked-2ld">locked-2ld</option>
                </select>
                <button
                  className="rounded-[12px] bg-ens-garnet-900 px-3 py-1 font-semi-mono text-ens-garnet-50 text-xs uppercase tracking-[1.2px] disabled:opacity-50"
                  disabled={!customNameInput.trim()}
                  onClick={handleAddCustomName}
                  type="button"
                >
                  Add
                </button>
              </div>
              {customError && (
                <p className="px-4 text-red-600 text-xs">{customError}</p>
              )}
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
                    .otherwise(() => (
                      <>
                        {filtered.map((item) => {
                          const isSelected = selected.has(item.name)
                          const isCustom = customNameSet.has(item.name)
                          return (
                            <div
                              className="flex items-center gap-3"
                              key={item.id}
                            >
                              <button
                                aria-pressed={isSelected}
                                className="flex flex-1 cursor-pointer items-center gap-3"
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
                              {isCustom && (
                                <button
                                  aria-label={`Remove ${item.name}`}
                                  className="flex size-7 shrink-0 items-center justify-center rounded-full text-ens-garnet-900/50 transition-colors hover:bg-ens-garnet-900/10 hover:text-ens-garnet-900"
                                  onClick={() =>
                                    handleRemoveCustomName(item.name)
                                  }
                                  type="button"
                                >
                                  <X className="size-4" strokeWidth={2.5} />
                                </button>
                              )}
                            </div>
                          )
                        })}

                        {filteredIneligible.length > 0 && (
                          <div className="mt-4 border-ens-garnet-900/10 border-t pt-4">
                            <div className="mb-3 flex items-center gap-2">
                              <AlertTriangle className="size-4 shrink-0 text-ens-garnet-900/50" />
                              <p className="font-semi-mono text-ens-garnet-900/50 text-xs uppercase tracking-[0.12px]">
                                <Trans>Not eligible for migration</Trans>
                              </p>
                            </div>
                            {filteredIneligible.map((item) => (
                              <div
                                className="flex items-center gap-3 py-1 opacity-50"
                                key={item.domain.id}
                              >
                                <div className="flex size-[37px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-ens-garnet-900/10">
                                  <span className="font-semi-mono text-ens-garnet-900 text-xs">
                                    {item.domain.labelName?.[0]?.toUpperCase() ??
                                      '?'}
                                  </span>
                                </div>
                                <div className="rounded-[2px] border border-[#595755]/20 bg-white/60 px-2 py-1 font-medium font-semi-mono text-[#595755]/60 text-base leading-[0.96] tracking-[-0.32px]">
                                  {item.domain.name}
                                </div>
                                <span className="text-ens-garnet-900/40 text-xs">
                                  {item.reason === 'unlocked-subname' ? (
                                    <Trans>
                                      Subname must be registered directly on ENS
                                      v2
                                    </Trans>
                                  ) : (
                                    <Trans>Not eligible for migration</Trans>
                                  )}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    ))}
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
              <span className="font-semi-mono"> out of </span>
              <span>{eligibleNames.length}</span>
              <span className="font-semi-mono"> eligible names selected</span>
            </Trans>
          </p>
          {totalSelected > 0 && (
            <p className="flex items-center gap-1 text-ens-garnet-900/50 text-xs">
              <Info className="size-3 shrink-0" />
              <Trans>
                Migration transfers ownership only. Records must be set manually
                on ENS v2 after migration.
              </Trans>
            </p>
          )}
        </div>
        <button
          className="h-[46px] w-full min-w-[160px] overflow-hidden rounded-sm bg-ens-garnet-900 px-4 py-2.5 font-semi-mono text-ens-garnet-50 text-sm uppercase tracking-[1.68px] shadow-[inset_0px_-3px_0px_0px_rgba(0,0,0,0.35)] disabled:opacity-50 sm:w-[320px]"
          disabled={totalSelected === 0 || isPending}
          onClick={onNext}
          type="button"
        >
          <Trans>Upgrade Names</Trans>
        </button>
      </div>
    </div>
  )
}
