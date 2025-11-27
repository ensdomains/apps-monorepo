import { Link } from '@tanstack/react-router'
import { ChevronDown, Heart, Info, MoreHorizontal, Search } from 'lucide-react'
import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import type { DashboardNameRow } from '@/features/dashboard/MOCK'

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

const formatDate = (value?: Date | null) => {
  if (!value) return '—'
  try {
    return dateFormatter.format(value)
  } catch {
    return '—'
  }
}

interface NamesTableProps {
  names?: DashboardNameRow[]
  isLoading: boolean
  error: unknown
}

export const MyNamesCard = ({ names, isLoading, error }: NamesTableProps) => {
  const displayNames = useMemo(() => names ?? [], [names])

  if (isLoading) {
    return (
      <Card className="border bg-white/90">
        <CardContent className="py-6 text-center text-muted-foreground text-sm">
          Loading your names...
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="border bg-white/90">
        <CardContent className="flex items-center gap-2 border border-destructive/40 bg-destructive/5 px-4 py-3 text-destructive text-sm">
          <Info className="size-4" />
          <span>We couldn&apos;t load your names. Please try again.</span>
        </CardContent>
      </Card>
    )
  }

  if (!displayNames.length) {
    return (
      <Card className="border bg-white/90">
        <CardContent className="py-6 text-center text-muted-foreground text-sm">
          No ENS names found for this wallet yet.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-[#dededf] border-[0.25px] bg-white/90">
      <CardHeader className="border-[#dededf] border-b-[0.25px] pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="font-semibold font-serif text-[#232222] text-[28px] tracking-[0.28px]">
              My Names
            </CardTitle>
            <Badge
              variant="lightBlue"
              className="rounded-full bg-[#e5f7ff] px-2 py-0.5 text-[#0080bc] text-sm"
            >
              {displayNames.length}
            </Badge>
          </div>
          <div className="w-[292px]">
            <Input
              size="sm"
              placeholder="Search my name..."
              startIcon={<Search className="size-[18px]" />}
              className="rounded-[4.1px] bg-ens-white"
            />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-6 text-[#7d7d7d] text-xs">
          <div className="w-6" />
          <div className="flex flex-1 items-center gap-1">
            <span>Name</span>
            <ChevronDown className="size-[8.2px]" />
          </div>
          <div className="flex w-[120px] items-center gap-1">
            <span>Registered on</span>
            <ChevronDown className="size-[8.2px]" />
          </div>
          <div className="flex w-[120px] items-center gap-1">
            <span>Expiry</span>
            <ChevronDown className="size-[8.2px]" />
          </div>
          <div className="flex w-[120px] items-center gap-1">
            <span>Autorenewal</span>
            <ChevronDown className="size-[8.2px]" />
          </div>
          <div className="w-6" />
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="flex items-center gap-3 border-[#dededf] border-b-[0.41px] px-6 py-3 text-xs">
          <input
            type="checkbox"
            className="size-3 rounded border-[#7d7d7d] border-[0.41px]"
            aria-label="Select all"
          />
          <span className="font-medium text-[#7d7d7d]">Select all</span>
        </div>

        {displayNames.map((name) => {
          const daysUntilExpiry =
            name.expiryDate != null
              ? Math.ceil(
                  (name.expiryDate.getTime() - Date.now()) /
                    (1000 * 60 * 60 * 24),
                )
              : null

          const expiresLabel =
            daysUntilExpiry != null && daysUntilExpiry > 0
              ? `Expires in ${daysUntilExpiry} days`
              : null

          return (
            <div
              key={name.id}
              className="flex items-start gap-4 border-[#dededf] border-b-[0.41px] px-6 py-6 last:border-b-0"
            >
              <div className="pt-2">
                <input
                  type="checkbox"
                  className="size-3 rounded border-[#7d7d7d] border-[0.41px]"
                  aria-label={`Select ${name.name}`}
                />
              </div>

              <div className="flex flex-1 flex-col gap-2">
                {name.isPrimary && (
                  <div className="inline-flex items-center gap-2">
                    <Badge
                      variant="lightBlue"
                      className="rounded-full bg-[#f1f5f9] px-2 py-0.5 text-[#0080bc] text-xs"
                    >
                      Primary Name
                    </Badge>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <div className="flex size-[36.9px] items-center justify-center rounded-full bg-[#faf9f6]" />
                  <Link
                    to="/p/$name"
                    params={{ name: name.name }}
                    className="h-auto rounded-[2.867px] bg-[#e5f7ff] px-3 py-1 font-sans font-semibold text-[#0080bc] text-[16px] hover:bg-[#e5f7ff]/80"
                  >
                    {name.name}
                  </Link>
                </div>

                <div className="flex items-center gap-2 text-[#7d7d7d] text-xs">
                  <span>Make Primary Name</span>
                  <Switch checked={name.isPrimary} disabled aria-hidden />
                </div>
              </div>

              <div className="w-[120px] pt-2 text-[#515151] text-sm">
                {formatDate(name.registrationDate ?? null)}
              </div>

              <div className="w-[120px] pt-2 text-[#515151] text-sm">
                <div>{formatDate(name.expiryDate ?? null)}</div>
                <button
                  type="button"
                  className="mt-1 font-medium text-[#0080bc] text-xs"
                >
                  Extend →
                </button>
                {expiresLabel && (
                  <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-[#fff8f0] px-2.5 py-1 text-[#d97706] text-[11px]">
                    <span className="inline-block size-1.5 rounded-full bg-[#f59e0b]" />
                    {expiresLabel}
                  </div>
                )}
              </div>

              <div className="w-[120px] pt-2 text-[#515151] text-sm">
                <div>{formatDate(name.autoRenewalDate ?? name.expiryDate)}</div>
                <button
                  type="button"
                  className="mt-1 font-medium text-[#0080bc] text-xs"
                >
                  Autorenewals →
                </button>
              </div>

              <button
                type="button"
                className="mt-2 ml-auto text-[#7d7d7d]"
                aria-label="More actions"
              >
                <MoreHorizontal className="size-5" />
              </button>
            </div>
          )
        })}

        <div className="flex h-14 items-center justify-between border-[#dededf] border-t-[0.41px] px-6 py-3 text-[#7d7d7d] text-xs">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="flex size-8 items-center justify-center rounded-md border border-[#d3d3d3] text-[#bcbcbc]"
            >
              ‹
            </button>
            <button
              type="button"
              className="flex size-8 items-center justify-center rounded-md bg-[#e5f7ff] text-[#0080bc]"
            >
              1
            </button>
            <button
              type="button"
              className="flex size-8 items-center justify-center rounded-md border border-[#d3d3d3] text-[#bcbcbc]"
            >
              2
            </button>
            <button
              type="button"
              className="flex size-8 items-center justify-center rounded-md border border-[#d3d3d3] text-[#bcbcbc]"
            >
              ›
            </button>
          </div>
          <span>
            Showing 1-{Math.min(5, displayNames.length)} of{' '}
            {displayNames.length}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

export const FavoritesCard = ({ names }: { names?: DashboardNameRow[] }) => {
  const displayNames = useMemo(() => names ?? [], [names])
  const favouriteSlice = displayNames.slice(0, 5)

  return (
    <Card className="border-[#dededf] border-[0.25px] bg-white/90">
      <CardHeader className="border-[#dededf] border-b-[0.25px] pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="font-semibold font-serif text-[#232222] text-[28px] tracking-[0.28px]">
              Favourites List
            </CardTitle>
            <Badge
              variant="lightBlue"
              className="rounded-full bg-[#ffecf5] px-2 py-0.5 text-[#f53293] text-sm"
            >
              {displayNames.length}
            </Badge>
          </div>
          <div className="w-[292px]">
            <Input
              size="sm"
              placeholder="Search name..."
              startIcon={<Search className="size-[18px]" />}
              className="rounded-[4.1px] bg-ens-white"
            />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between text-[#7d7d7d] text-xs">
          <div className="flex items-center gap-1">
            <span>Name</span>
            <ChevronDown className="size-[8.2px]" />
          </div>
          <span className="pr-4">Notifications</span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {favouriteSlice.length === 0 ? (
          <div className="px-6 py-4 text-[#8c8c8c] text-sm">
            When you start collecting names, you&apos;ll be able to pin your
            favourites here.
          </div>
        ) : (
          <>
            <ul className="divide-y divide-[#dededf]">
              {favouriteSlice.map((name, index) => (
                <li
                  key={name.id}
                  className="flex h-16 items-center justify-between gap-[25px] px-6 py-6"
                >
                  <div className="flex items-center gap-3">
                    <Heart className="size-4 fill-[#ec4899] text-[#ec4899]" />
                    <div className="flex size-[36.9px] items-center justify-center rounded-full bg-[#faf9f6]" />
                    <Link
                      to="/p/$name"
                      params={{ name: name.name }}
                      className="rounded-[2.867px] bg-[#e5f7ff] px-3 py-1 font-sans font-semibold text-[#0080bc] text-[16px] hover:bg-[#e5f7ff]/80"
                    >
                      {name.name ?? name.truncatedName ?? 'Unnamed'}
                    </Link>
                  </div>
                  <Switch checked={index === 0} aria-label="Notifications" />
                </li>
              ))}
            </ul>
            <div className="flex h-14 items-center justify-between border-[#dededf] border-t-[0.41px] px-6 py-3 text-[#7d7d7d] text-xs">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="flex size-8 items-center justify-center rounded-md border border-[#d3d3d3] text-[#bcbcbc]"
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="flex size-8 items-center justify-center rounded-md bg-[#e5f7ff] text-[#0080bc]"
                >
                  1
                </button>
                <button
                  type="button"
                  className="flex size-8 items-center justify-center rounded-md border border-[#d3d3d3] text-[#bcbcbc]"
                >
                  2
                </button>
                <span className="px-1">…</span>
                <button
                  type="button"
                  className="flex size-8 items-center justify-center rounded-md border border-[#d3d3d3] text-[#bcbcbc]"
                >
                  32
                </button>
                <button
                  type="button"
                  className="flex size-8 items-center justify-center rounded-md border border-[#d3d3d3] text-[#bcbcbc]"
                >
                  ›
                </button>
              </div>
              <span>
                Showing 1-{Math.min(5, displayNames.length)} of{' '}
                {displayNames.length}
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
