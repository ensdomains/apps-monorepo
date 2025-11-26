import { Link } from '@tanstack/react-router'
import { ChevronDown, Info, MoreHorizontal, Search, Star } from 'lucide-react'
import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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

export const NamesTable = ({ names, isLoading, error }: NamesTableProps) => {
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

  const favouriteSlice = displayNames.slice(0, 3)

  return (
    <div className="space-y-6">
      <Card className="border bg-white/90">
        <CardHeader className="border-b pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-lg">My Names</h3>
              <Badge variant="lightBlue" className="rounded-full px-2 py-0.5">
                {displayNames.length}
              </Badge>
            </div>
            <div className="w-64">
              <Input
                size="sm"
                placeholder="Search my name..."
                startIcon={<Search className="size-4" />}
              />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-6 text-muted-foreground text-xs">
            <div className="w-6" />
            <div className="flex flex-1 items-center gap-1">
              <span>Name</span>
              <ChevronDown className="size-3" />
            </div>
            <div className="flex w-40 items-center gap-1">
              <span>Registered on</span>
              <ChevronDown className="size-3" />
            </div>
            <div className="flex w-40 items-center gap-1">
              <span>Expiry</span>
              <ChevronDown className="size-3" />
            </div>
            <div className="flex w-40 items-center gap-1">
              <span>Autorenewal</span>
              <ChevronDown className="size-3" />
            </div>
            <div className="w-6" />
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="flex items-center gap-3 border-b px-6 py-3 text-xs">
            <input
              type="checkbox"
              className="size-4 rounded border border-gray-300"
              aria-label="Select all"
            />
            <span className="font-medium text-muted-foreground">
              Select all
            </span>
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
                className="flex items-start gap-4 border-b px-6 py-4 last:border-b-0"
              >
                <div className="pt-2">
                  <input
                    type="checkbox"
                    className="size-4 rounded border border-gray-300"
                    aria-label={`Select ${name.name}`}
                  />
                </div>

                <div className="flex flex-1 flex-col gap-2">
                  {name.isPrimary && (
                    <div className="inline-flex items-center gap-2">
                      <Badge
                        variant="lightBlue"
                        className="rounded-full px-2 py-0.5 text-xs"
                      >
                        Primary Name
                      </Badge>
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-full bg-muted" />
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="h-auto rounded-[12px] bg-ens-blue/10 px-3 py-1 font-sans font-semibold text-ens-blue text-sm hover:bg-ens-blue/15"
                    >
                      <Link to="/p/$name" params={{ name: name.name }}>
                        {name.name}
                      </Link>
                    </Button>
                  </div>

                  <div className="flex items-center gap-2 text-muted-foreground text-xs">
                    <span>Make Primary Name</span>
                    <Switch checked={name.isPrimary} disabled aria-hidden />
                  </div>
                </div>

                <div className="w-40 pt-2 text-sm">
                  {formatDate(name.registrationDate ?? null)}
                </div>

                <div className="w-40 pt-2 text-sm">
                  <div>{formatDate(name.expiryDate ?? null)}</div>
                  <button
                    type="button"
                    className="mt-1 font-medium text-ens-blue text-xs"
                  >
                    Extend →
                  </button>
                  {expiresLabel && (
                    <div className="mt-1 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">
                      <span className="mr-1 inline-block size-1.5 rounded-full bg-amber-500" />
                      {expiresLabel}
                    </div>
                  )}
                </div>

                <div className="w-40 pt-2 text-sm">
                  <div>
                    {formatDate(name.autoRenewalDate ?? name.expiryDate)}
                  </div>
                  <button
                    type="button"
                    className="mt-1 font-medium text-ens-blue text-xs"
                  >
                    Autorenewals →
                  </button>
                </div>

                <button
                  type="button"
                  className="mt-2 ml-auto text-muted-foreground"
                  aria-label="More actions"
                >
                  <MoreHorizontal className="size-5" />
                </button>
              </div>
            )
          })}

          <div className="flex items-center justify-between border-t px-6 py-3 text-muted-foreground text-xs">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="flex size-7 items-center justify-center rounded-full border border-gray-300 text-gray-500"
              >
                ‹
              </button>
              <button
                type="button"
                className="flex size-7 items-center justify-center rounded-full bg-ens-blue text-white"
              >
                1
              </button>
              <button
                type="button"
                className="flex size-7 items-center justify-center rounded-full border border-gray-300 text-gray-500"
              >
                2
              </button>
              <button
                type="button"
                className="flex size-7 items-center justify-center rounded-full border border-gray-300 text-gray-500"
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

      <Card className="border bg-white/90">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Star className="size-4 text-ens-blue" />
            Favourites
          </CardTitle>
          <CardDescription>
            A quick list of names you use the most.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {favouriteSlice.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              When you start collecting names, you&apos;ll be able to pin your
              favourites here.
            </p>
          ) : (
            <ul className="space-y-2">
              {favouriteSlice.map((name) => (
                <li
                  key={name.id}
                  className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <Star className="size-4 text-ens-blue" />
                    <span className="rounded-[12px] bg-ens-blue/10 px-2 py-0.5 font-sans font-semibold text-ens-blue text-sm">
                      {name.name ?? name.truncatedName ?? 'Unnamed'}
                    </span>
                  </div>
                  <span className="text-muted-foreground text-xs">
                    Expires {formatDate(name.expiryDate ?? null)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
