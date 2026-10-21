import { Link, type LinkOptions } from '@tanstack/react-router'
import type { ComponentType } from 'react'
import type { Address } from 'viem'
import { cn } from '@/lib/utils'
import { useSidebar } from './ui/sidebar'

const KIND = {
  contract: { eyebrow: 'Contract', className: 'text-danger-text' },
  address: { eyebrow: 'Address', className: 'text-success-text' },
} as const

/** Figma "Nav Title": the entity's kind over its full address, linking to the overview. */
export const SidebarEntityTab = ({
  kind,
  address,
  icon: Icon,
  link,
}: {
  readonly kind: keyof typeof KIND
  readonly address: Address
  readonly icon: ComponentType<{ className?: string }>
  readonly link: LinkOptions
}) => {
  const { setOpenMobile } = useSidebar()
  const { eyebrow, className } = KIND[kind]

  return (
    <div className="px-6 group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2">
      <Link
        {...link}
        activeProps={{ 'data-active': 'true' }}
        activeOptions={{ exact: true }}
        onClick={() => setOpenMobile(false)}
        className="group/title flex w-full min-h-9 items-start gap-2.5 rounded-lg bg-neutral-2 px-3 py-2.5 outline-hidden ring-sidebar-ring transition-colors hover:bg-neutral-3 focus-visible:ring-2 data-[active=true]:bg-neutral-3 group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0"
      >
        <Icon className={cn('size-4 shrink-0', className)} />
        <span className="flex min-w-0 flex-col gap-1 group-data-[collapsible=icon]:hidden">
          <span className={cn('text-small', className)}>{eyebrow}</span>
          <span className="break-all text-entity-base text-neutral-8">
            {address}
          </span>
        </span>
      </Link>
    </div>
  )
}
