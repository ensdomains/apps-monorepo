import { Trans } from '@lingui/react/macro'
import { Check, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'

type MockName = {
  name: string
  avatar: string
  isPrimary: boolean
}

const MOCK_NAMES: MockName[] = [
  {
    name: 'erni.eth',
    avatar: 'https://placehold.co/40/e91e8c/fff?text=E',
    isPrimary: true,
  },
  {
    name: 'lunaverse.eth',
    avatar: 'https://placehold.co/40/7c3aed/fff?text=L',
    isPrimary: false,
  },
  {
    name: 'cosmicdreamer.eth',
    avatar: 'https://placehold.co/40/404040/fff?text=C',
    isPrimary: false,
  },
  {
    name: 'starryknight.eth',
    avatar: 'https://placehold.co/40/6366f1/fff?text=S',
    isPrimary: false,
  },
  {
    name: 'neonwaves.eth',
    avatar: 'https://placehold.co/40/0ea5e9/fff?text=N',
    isPrimary: false,
  },
  {
    name: 'pixelcraft.eth',
    avatar: 'https://placehold.co/40/f97316/fff?text=P',
    isPrimary: false,
  },
  {
    name: 'etherealwind.eth',
    avatar: 'https://placehold.co/40/14b8a6/fff?text=E',
    isPrimary: false,
  },
]

export const MigrationPage = () => {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(MOCK_NAMES.map((n) => n.name)),
  )

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
      return next
    })
  }

  const selectedCount = filtered.filter((n) => selected.has(n.name)).length

  return (
    <div className="relative h-[calc(100dvh-80px)] overflow-hidden bg-linear-to-b from-[#feeaf0] to-[#ffc5df]">
      {/* Grain texture */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 size-full opacity-40"
      >
        <filter id="migration-page-grain">
          <feTurbulence
            baseFrequency="0.7"
            numOctaves="4"
            seed="3"
            stitchTiles="stitch"
            type="fractalNoise"
          />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0.96
                    0 0 0 0 0.196
                    0 0 0 0 0.576
                    0 0 0 0.5 0"
          />
        </filter>
        <rect filter="url(#migration-page-grain)" height="100%" width="100%" />
      </svg>

      <div className="relative z-10 mx-auto flex h-full max-w-2xl flex-col justify-center gap-8 px-5 py-4">
        {/* Title */}
        <h1 className="text-[32px] text-ens-garnet-900 leading-[1.1] tracking-[-0.64px]">
          <Trans>Your names are ready to upgrade</Trans>
        </h1>

        {/* Search */}
        <div className="flex items-center gap-3 rounded-full bg-[#fffafc] px-3 py-2">
          <Search className="size-5 text-ens-garnet-900/30" />
          <input
            className="flex-1 bg-transparent text-ens-garnet-900 text-sm leading-[0.96] tracking-[-0.28px] placeholder:text-ens-garnet-900/20 focus:outline-none"
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search names"
            type="text"
            value={search}
          />
        </div>

        {/* Names list */}
        <div className="flex max-h-[400px] flex-col gap-4 overflow-y-auto pr-2 md:max-h-[500px]">
          {filtered.map((item) => {
            const isSelected = selected.has(item.name)
            return (
              <button
                className="flex cursor-pointer items-center gap-3"
                key={item.name}
                onClick={() => toggleName(item.name)}
                type="button"
              >
                {/* Checkbox */}
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

                {/* Avatar */}
                <img
                  alt={item.name}
                  className="size-9 shrink-0 rounded-full object-cover"
                  src={item.avatar}
                />

                {/* Name */}
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

        {/* Bottom: counter + button */}
        <div className="flex flex-col gap-2">
          <p className="text-ens-garnet-900">
            <span className="font-medium font-semi-mono text-[10px] leading-[1.2] tracking-[0.1px]">
              {selectedCount}{' '}
            </span>
            <span className="font-semi-mono text-[10px] leading-[1.2] tracking-[0.1px]">
              OUT OF {filtered.length} ELIGIBLE NAMES SELECTED
            </span>
          </p>
          <button
            className="relative w-full overflow-hidden rounded-sm bg-ens-garnet-900 px-4 py-3 font-semi-mono text-[#fff6f9] text-sm uppercase tracking-[1.68px] shadow-[inset_0px_-3px_0px_0px_rgba(0,0,0,0.35)]"
            type="button"
          >
            <Trans>Begin Upgrade</Trans>
          </button>
        </div>
      </div>
    </div>
  )
}
