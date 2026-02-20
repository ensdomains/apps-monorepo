import { keepPreviousData, useQueries } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import clsx from 'clsx'
import {
  ArrowUpRight,
  CircleArrowLeft,
  CircleArrowRight,
  Info,
  Loader2,
  Wallet,
} from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import placeholderAvatar from '@/assets/placeholder-avatar.svg'
import { CopyableAddress } from '@/components/atoms/CopyableAddress'
import { CountBadge } from '@/components/atoms/CountBadge'
import * as ImageFallback from '@/components/atoms/ImageFallback'
import { Card } from '@/components/ui/card'
import {
  formatDashboardDate,
  resolveDomainLabel,
  toDateFromSeconds,
} from '@/features/dashboard/utils'
import { useAvatarFromName } from '../../service/profileAvatar'
import {
  PROFILE_NAMES_PAGE_SIZE,
  profileOwnedNamesQuery,
} from '../../service/profileOwnedNames'
import { profileOwnedNamesCountQuery } from '../../service/profileOwnedNamesCount'

const shortenAddress = (value: string) =>
  `${value.slice(0, 6)}...${value.slice(-4)}`

const formatExpiry = (expiry?: number | null) => {
  const asDate = toDateFromSeconds(expiry)
  const formatted = formatDashboardDate(asDate)

  return formatted === '—' ? 'No expiry set' : `Expires ${formatted}`
}

const NameAvatar = ({ name }: { name: string }) => {
  const { data: avatarUrl, isLoading } = useAvatarFromName({ name })

  return (
    <div className="relative size-[32px] shrink-0 overflow-hidden rounded-full bg-[#faf9f6] md:size-[36.9px]">
      <ImageFallback.Root className="size-full">
        <ImageFallback.Image
          alt={`${name} avatar`}
          className="size-full object-cover"
          src={avatarUrl ?? undefined}
        />
        <ImageFallback.Fallback>
          <img
            alt={`${name} fallback avatar`}
            className="size-full object-cover"
            src={placeholderAvatar}
          />
          {isLoading && (
            <div className="absolute inset-0 animate-pulse rounded-full bg-gray-100" />
          )}
        </ImageFallback.Fallback>
      </ImageFallback.Root>
    </div>
  )
}

export const AddressProfileView = ({
  address,
  primaryName,
}: {
  address: Address
  primaryName?: string
}) => {
  const shouldReduceMotion = useReducedMotion()
  const [page, setPage] = useState(1)

  const [ownedNamesQuery, ownedNamesCountQueryState] = useQueries({
    queries: [
      {
        ...profileOwnedNamesQuery(address, {
          skip: (page - 1) * PROFILE_NAMES_PAGE_SIZE,
        }),
        placeholderData: keepPreviousData,
      },
      {
        ...profileOwnedNamesCountQuery(address),
      },
    ],
  })

  const { data, isPending, isError, isPlaceholderData } = ownedNamesQuery
  const { data: namesCount } = ownedNamesCountQueryState

  const names = data?.domains ?? []
  const hasNextPage = names.length === PROFILE_NAMES_PAGE_SIZE

  const handlePrev = () => {
    if (!isPending && page > 1) setPage((p) => p - 1)
  }

  const handleNext = () => {
    if (!isPending && hasNextPage) setPage((p) => p + 1)
  }

  const staggerProps = (index: number) =>
    shouldReduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: 6 },
          animate: { opacity: 1, y: 0 },
          transition: {
            duration: 0.25,
            ease: [0.25, 0.46, 0.45, 0.94] as const,
            delay: index * 0.04,
          },
        }

  const namesContent = match({
    isPending,
    isError,
    hasNames: names.length > 0,
  })
    .with({ isPending: true }, () => (
      <div>
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            className="border-[lightgrey] border-b-[0.41px] py-[24px] last:border-none"
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton items
            key={index}
          >
            <div className="flex items-center gap-3 md:gap-[12px]">
              <div className="size-[32px] shrink-0 animate-pulse rounded-full bg-ens-white md:size-[36.9px]" />
              <div className="h-[28px] w-[160px] animate-pulse rounded-[2.8px] bg-ens-white" />
            </div>
          </div>
        ))}
      </div>
    ))
    .with({ isError: true }, () => (
      <div className="rounded-lg bg-[#fff8f0] px-4 py-3 text-[#c68a1b] text-sm">
        Unable to load names for this address. Please try again.
      </div>
    ))
    .with({ hasNames: false }, () => (
      <div className="rounded-lg bg-ens-white px-4 py-6 text-center text-muted-foreground text-sm">
        No ENS names found for this address on this network.
      </div>
    ))
    .otherwise(() => (
      <div>
        {names.map((domain, index) => {
          const label = resolveDomainLabel(domain)

          return (
            <motion.div
              className="border-[lightgrey] border-b-[0.41px] py-[24px] last:border-none"
              key={domain.id}
              {...staggerProps(index)}
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex min-w-0 items-center gap-2 md:max-w-full-[180px] md:gap-[12px]">
                  <NameAvatar name={label} />
                  <div className="flex min-w-0 items-center rounded-[2.8px] bg-[#e5f7ff] px-2 py-1 md:px-[8px] md:py-[4px]">
                    <Link
                      className="mr-1 min-w-0 break-all font-medium font-mono text-ens-blue text-sm tracking-[-0.28px] [text-wrap:pretty] md:mr-2 md:tracking-[-0.32px]"
                      params={{ name: label }}
                      to="/p/$name"
                    >
                      {label}
                    </Link>
                    <ArrowUpRight
                      className="size-2 shrink-0 text-ens-blue md:size-3"
                      strokeWidth={2}
                    />
                  </div>
                </div>
                <span className="shrink-0 text-muted-foreground text-sm tracking-[-0.24px]">
                  {formatExpiry(domain.expiryDate)}
                </span>
              </div>
            </motion.div>
          )
        })}
      </div>
    ))

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 pt-6 pb-12 md:space-y-8 md:pt-10">
      <Card className="rounded-none border-[0.25px] border-border bg-white p-4 shadow-none md:rounded-lg md:p-6">
        <div className="flex min-w-0 flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex items-center gap-2">
              <Wallet
                className="size-4 text-muted-foreground"
                strokeWidth={1.5}
              />
              <span className="font-sans text-muted-foreground text-sm">
                Address profile
              </span>
            </div>
            <CopyableAddress
              address={address}
              textClassName="text-[20px] text-foreground leading-[0.96] tracking-[-0.4px] md:text-[24px] md:tracking-[-0.48px]"
            />
            {primaryName ? (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm">
                  Primary name
                </span>
                <Link
                  className="inline-flex items-center gap-1 rounded-[2.8px] bg-[#e5f7ff] px-2 py-1 font-medium font-mono text-ens-blue text-sm tracking-[-0.28px] md:px-[8px] md:py-[4px]"
                  params={{ name: primaryName }}
                  to="/p/$name"
                >
                  {primaryName}
                  <ArrowUpRight
                    className="size-2 text-ens-blue md:size-3"
                    strokeWidth={2}
                  />
                </Link>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-lg bg-ens-white p-3 text-muted-foreground text-sm">
                <Info className="mt-[2px] size-4 shrink-0" />
                <p>This address does not have a primary ENS name.</p>
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card className="rounded-none border-[0.25px] border-border bg-white p-4 shadow-none md:rounded-lg md:px-6 md:py-8">
        <div className="mb-[20px] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="font-serif text-[20px] text-foreground leading-[0.96] tracking-[0.2px] md:text-[28px] md:tracking-[0.28px]">
              Registered ENS names
            </span>
            {namesCount !== undefined && namesCount > 0 && (
              <CountBadge value={namesCount} />
            )}
          </div>
          <span className="text-muted-foreground text-sm">
            {shortenAddress(address)}
          </span>
        </div>

        <div
          className={clsx(isPlaceholderData && 'opacity-50 transition-opacity')}
        >
          {namesContent}
        </div>

        {!isPending && !isError && names.length > 0 && (
          <div className="mt-[32px] flex flex-col gap-3 md:h-[56px] md:flex-row md:items-center md:justify-between">
            <div className="flex items-center justify-center gap-[12px]">
              <button
                className="flex size-[32px] items-center justify-center text-ens-gray-three disabled:text-border"
                disabled={isPending || page === 1}
                onClick={handlePrev}
                type="button"
              >
                <CircleArrowLeft className="size-[32px]" strokeWidth={1} />
              </button>
              <button
                className="flex size-[32px] items-center justify-center text-ens-blue disabled:text-border"
                disabled={isPending || !hasNextPage}
                onClick={handleNext}
                type="button"
              >
                <CircleArrowRight className="size-[32px]" strokeWidth={1} />
              </button>
            </div>
            <span className="flex items-center justify-center gap-1.5 font-sans text-[16px] text-muted-foreground leading-[1.2] tracking-[0.14px]">
              {isPlaceholderData && (
                <Loader2 className="size-[12px] animate-spin" />
              )}
              Showing registered names
            </span>
          </div>
        )}
      </Card>
    </div>
  )
}
