import { Trans } from '@lingui/react/macro'
import { CircleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import ensMarkBadge from '@/assets/ens-mark-badge.svg'
import { cn } from '@/lib/utils'

const pillBase =
  'inline-flex h-5 w-fit shrink-0 items-center gap-1 rounded-full px-2 font-sans text-[14px] leading-none tracking-[0.28px] whitespace-nowrap'

type PillProps = {
  readonly className?: string
  readonly children: ReactNode
}

const Pill = ({ className, children }: PillProps) => (
  <span className={cn(pillBase, className)}>{children}</span>
)

const EnsMark = ({ className }: { readonly className?: string }) => (
  <img alt="" className={cn('size-4 shrink-0', className)} src={ensMarkBadge} />
)

export const EligibleForUpgradePill = () => (
  <Pill className="bg-ens-garnet-100 text-ens-garnet-500">
    <EnsMark />
    <Trans>Eligible for upgrade</Trans>
  </Pill>
)

export const Ensv1OnlyPill = () => (
  <Pill className="border-[0.5px] border-ens-peridot-500 text-ens-peridot-500">
    <EnsMark />
    <Trans>ENSv1 only</Trans>
  </Pill>
)

export type NameRole = 'owner' | 'manager'

export const RolePill = ({ role }: { readonly role: NameRole }) =>
  role === 'owner' ? (
    <Pill className="border-[0.5px] border-ens-peridot-900 text-ens-peridot-900">
      <Trans>Owner</Trans>
    </Pill>
  ) : (
    <Pill className="border-[0.5px] border-ens-quartz-400 text-ens-quartz-500">
      <Trans>Manager</Trans>
    </Pill>
  )

export const ExpiringPill = ({ days }: { readonly days: number }) => (
  <Pill className="bg-[#fff8f0] text-[#c68a1b]">
    <CircleAlert
      className="size-4 shrink-0 text-ens-citrine-500"
      strokeWidth={2}
    />
    <Trans>Expires in {days} days</Trans>
  </Pill>
)
