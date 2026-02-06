import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowUpRight, Info, Wallet } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import placeholderAvatar from '@/assets/placeholder-avatar.svg'
import { CopyableAddress } from '@/components/atoms/CopyableAddress'
import * as ImageFallback from '@/components/atoms/ImageFallback'
import { Card } from '@/components/ui/card'
import {
  formatDashboardDate,
  resolveDomainLabel,
  toDateFromSeconds,
} from '@/features/dashboard/utils'
import { useAvatarFromName } from '../../service/profileAvatar'
import { profileOwnedNamesQuery } from '../../service/profileOwnedNames'

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
  const { data, isPending, isError } = useQuery({
    ...profileOwnedNamesQuery(address),
  })

  const names = data?.domains ?? []

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
                <div className="flex min-w-0 items-center gap-2 md:max-w-[calc(100%-180px)] md:gap-[12px]">
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
            {names.length > 0 && !isPending ? (
              <span className="flex items-center justify-center rounded-[14px] bg-[#ffecf5] px-[6.56px] py-[1.64px] font-sans text-[#f53293] text-sm leading-[1.05] tracking-[0.28px]">
                {names.length}
              </span>
            ) : null}
          </div>
          <span className="text-muted-foreground text-sm">
            {shortenAddress(address)}
          </span>
        </div>

        {namesContent}
      </Card>
    </div>
  )
}
