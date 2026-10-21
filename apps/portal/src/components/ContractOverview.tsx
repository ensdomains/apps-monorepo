import { createLink } from '@tanstack/react-router'
import { BadgeCheck, BookText, ChevronRight } from 'lucide-react'
import { forwardRef, type ReactNode } from 'react'
import { ExternalLink } from 'react-external-link'
import type { Address } from 'viem'
import { EthCoinIcon } from '@/assets/icons'
import { formatDocsHref } from '@/lib/constants/contractDocs'
import { cn } from '@/lib/utils'

const semiMonoValueClassName = 'font-semi-mono text-base text-neutral-7'

/** The Type row: a verified mark in front of the contract's kind. */
export const ContractTypeValue = ({
  isVerified,
  children,
}: {
  readonly isVerified: boolean
  readonly children: ReactNode
}) => (
  <span
    className={cn('inline-flex items-center gap-1', semiMonoValueClassName)}
  >
    {isVerified ? (
      <BadgeCheck className="size-4 shrink-0 text-type-entity-text" />
    ) : null}
    {children}
  </span>
)

export const ContractDocsValue = ({ href }: { readonly href: string }) => (
  <ExternalLink
    href={href}
    className={cn(
      'inline-flex items-center gap-1 hover:underline',
      semiMonoValueClassName,
    )}
  >
    <BookText className="size-4 shrink-0 text-neutral-6" />
    {formatDocsHref(href)}
  </ExternalLink>
)

export const ContractAddressValue = ({
  address,
}: {
  readonly address: Address
}) => (
  <span className="inline-flex items-center gap-1 break-all text-entity-base text-neutral-7">
    <EthCoinIcon className="size-4 shrink-0" />
    {address}
  </span>
)

export const ContractCounterCards = ({
  children,
}: {
  readonly children: ReactNode
}) => <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">{children}</div>

const CounterCardAnchor = forwardRef<
  HTMLAnchorElement,
  React.ComponentPropsWithoutRef<'a'>
>((props, ref) => (
  <a
    ref={ref}
    {...props}
    className="flex items-center gap-3 rounded-lg border border-neutral-2 p-4 no-underline transition-colors hover:bg-neutral-1"
  />
))
CounterCardAnchor.displayName = 'CounterCardAnchor'

export const ContractCounterCard = createLink(CounterCardAnchor)

/** Figma "Block": icon + label, the count in semi-mono, and a chevron well on the right. */
export const ContractCounterCardContent = ({
  icon: Icon,
  label,
  value,
}: {
  readonly icon: React.ComponentType<{ className?: string }>
  readonly label: ReactNode
  readonly value: ReactNode
}) => (
  <>
    <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
      <span className="flex items-center gap-2 text-base text-neutral-7">
        <Icon className="size-4 shrink-0 text-neutral-6" />
        {label}
      </span>
      <span className="font-semi-mono text-[20px] text-foreground">
        {value}
      </span>
    </span>
    <span className="flex h-[47px] w-6 shrink-0 items-center justify-center rounded bg-neutral-1 text-neutral-4">
      <ChevronRight className="size-4" />
    </span>
  </>
)
