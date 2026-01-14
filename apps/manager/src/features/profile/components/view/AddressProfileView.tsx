import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowUpRight, Info, Wallet } from 'lucide-react'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { CopyToClipboard } from '@/components/atoms/CopyToClipboard'
import {
  formatDashboardDate,
  resolveDomainLabel,
  toDateFromSeconds,
} from '@/features/dashboard/utils'
import { profileOwnedNamesQuery } from '../../service/profileOwnedNames'

const shortenAddress = (value: string) =>
  `${value.slice(0, 6)}...${value.slice(-4)}`

const formatExpiry = (expiry?: number | null) => {
  const asDate = toDateFromSeconds(expiry)
  const formatted = formatDashboardDate(asDate)

  return formatted === '—' ? 'No expiry set' : `Expires ${formatted}`
}

export const AddressProfileView = ({ address }: { address: Address }) => {
  const { data, isPending, isError } = useQuery({
    ...profileOwnedNamesQuery(address),
  })

  const names = data?.domains ?? []

  const namesContent = match({
    isPending,
    isError,
    hasNames: names.length > 0,
  })
    .with({ isPending: true }, () => (
      <div className="grid gap-3 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: TODO: We need to fix this
            className="h-[92px] animate-pulse rounded-lg border border-slate-200 bg-slate-50"
            key={index}
          />
        ))}
      </div>
    ))
    .with({ isError: true }, () => (
      <div className="rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-rose-700 text-sm">
        Unable to load names for this address. Please try again.
      </div>
    ))
    .with({ hasNames: false }, () => (
      <div className="rounded-lg border border-slate-200 border-dashed bg-slate-50 px-4 py-6 text-center text-slate-600 text-sm">
        No ENS names found for this address on this network.
      </div>
    ))
    .otherwise(() => (
      <div className="grid gap-3 md:grid-cols-2">
        {names.map((domain) => {
          const label = resolveDomainLabel(domain)

          return (
            <Link
              className="group hover:-translate-y-0.5 rounded-lg border border-slate-200 p-4 transition hover:border-slate-400 hover:shadow-sm"
              key={domain.id}
              params={{ name: label }}
              to="/p/$name"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-base text-slate-900">
                  {label}
                </span>
                <ArrowUpRight className="size-4 text-slate-500 transition group-hover:text-slate-700" />
              </div>
              <p className="mt-2 text-slate-600 text-sm">
                {formatExpiry(domain.expiryDate)}
              </p>
            </Link>
          )
        })}
      </div>
    ))

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 pt-6 pb-12">
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 font-semibold text-slate-900 text-sm">
              <Wallet className="size-4" />
              Address profile
            </div>
            <p className="font-mono text-lg text-slate-900">{address}</p>
            <p className="text-slate-600 text-sm">
              No primary ENS name is set for this address.
            </p>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-slate-50">
            <CopyToClipboard
              className="size-4 text-slate-700"
              value={address}
            />
          </div>
        </div>
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-slate-50 p-4 text-slate-700 text-sm">
          <Info className="mt-[2px] size-4 text-slate-500" />
          <p>This address does not have a primary ENS name.</p>
        </div>
      </div>
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-base text-slate-900">
              Registered ENS names
            </p>
            <p className="text-slate-600 text-sm">
              Names owned by {shortenAddress(address)}
            </p>
          </div>
          {names.length > 0 && !isPending ? (
            <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700 text-xs">
              {names.length} {names.length === 1 ? 'name' : 'names'}
            </span>
          ) : null}
        </div>

        {namesContent}
      </div>
    </div>
  )
}
