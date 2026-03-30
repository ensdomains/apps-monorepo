import { Trans, useLingui } from '@lingui/react/macro'
import { Check, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { MOCK_NAMES } from './SelectNamesStep.mock'

type SelectNamesStepProps = {
  readonly onNamesChange: (names: string[]) => void
  readonly onNext: () => void
}

export const SelectNamesStep = ({
  onNamesChange,
  onNext,
}: SelectNamesStepProps) => {
  const { t } = useLingui()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(() => {
    const initial = new Set(MOCK_NAMES.map((n) => n.name))
    onNamesChange([...initial])
    return initial
  })

  const filtered = useMemo(
    () =>
      MOCK_NAMES.filter((n) =>
        n.name.toLowerCase().includes(search.toLowerCase()),
      ),
    [search],
  )

  const toggleName = (name: string) => {
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
  }

  const selectedCount = filtered.filter((n) => selected.has(n.name)).length

  return (
    <div className="relative z-10 mx-auto flex h-full max-w-2xl flex-col justify-center gap-8 px-5 py-4">
      <h1 className="text-[32px] text-ens-garnet-900 leading-[1.1] tracking-[-0.64px]">
        <Trans>Your names are ready to upgrade</Trans>
      </h1>

      <div className="flex items-center gap-3 rounded-full bg-[#fffafc] px-3 py-2">
        <Search className="size-5 text-ens-garnet-900/30" />
        <input
          className="flex-1 bg-transparent text-ens-garnet-900 text-sm leading-[0.96] tracking-[-0.28px] placeholder:text-ens-garnet-900/20 focus:outline-none"
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t`Search names`}
          type="text"
          value={search}
        />
      </div>

      <div className="flex max-h-[320px] flex-col gap-4 overflow-y-auto pr-2 md:max-h-[400px]">
        {filtered.map((item) => {
          const isSelected = selected.has(item.name)
          return (
            <button
              className="flex cursor-pointer items-center gap-3"
              key={item.name}
              onClick={() => toggleName(item.name)}
              type="button"
            >
              <div
                className={cn(
                  'flex shrink-0 items-center justify-center rounded-sm p-1 transition-colors',
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
              <img
                alt={item.name}
                className="size-9 shrink-0 rounded-full object-cover"
                src={item.avatar}
              />
              <div
                className={cn(
                  'rounded-xs border px-2 py-1 font-medium font-semi-mono text-base leading-[0.96] tracking-[-0.32px]',
                  item.isPrimary
                    ? 'border-ens-lapis-core bg-white text-ens-lapis-core'
                    : 'border-[#595755]/40 bg-white text-[#595755]',
                )}
              >
                {item.name}
              </div>
            </button>
          )
        })}
      </div>

      <div className="flex flex-col gap-2">
        <p className="font-semi-mono text-[10px] text-ens-garnet-900 uppercase leading-[1.2] tracking-[0.1px]">
          <Trans>
            <span className="font-medium">{selectedCount}</span> out of{' '}
            {filtered.length} eligible names selected
          </Trans>
        </p>
        <button
          className="relative w-full overflow-hidden rounded-sm bg-ens-garnet-900 px-4 py-3 font-semi-mono text-[#fff6f9] text-sm uppercase tracking-[1.68px] shadow-[inset_0px_-3px_0px_0px_rgba(0,0,0,0.35)]"
          disabled={selectedCount === 0}
          onClick={onNext}
          type="button"
        >
          <Trans>Begin Upgrade</Trans>
        </button>
      </div>
    </div>
  )
}
