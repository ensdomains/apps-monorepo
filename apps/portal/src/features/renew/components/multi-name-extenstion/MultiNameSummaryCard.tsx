import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { cn } from '@/lib/utils'
import type { NamePricingData } from '../../hooks/useMultiNamePricing'

type MultiNameSummaryCardProps = {
  readonly pricingData: NamePricingData
}

export const MultiNameSummaryCard = ({
  pricingData,
}: MultiNameSummaryCardProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const { selectedName, isLoading, display } = pricingData

  if (isLoading || !display) {
    return <MultiNameSummaryCardSkeleton name={selectedName.name} />
  }

  const {
    registrationPeriod,
    newExpiryFormatted,
    priceLabel,
    priceValue,
    subtotal,
  } = display

  return (
    <div className="border-b border-border overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
      >
        <NameAvatar
          name={selectedName.name}
          height="40px"
          width="40px"
          rounded="rounded-md"
        />
        <div className="flex flex-col">
          <span className="flex-1 text-left text-base font-medium text-quartz-900 truncate">
            {selectedName.name}
          </span>
          <span className="text-base text-quartz-350 shrink-0">
            Subtotal: {subtotal}
          </span>
        </div>
        <ChevronDown
          className={cn(
            'size-4 text-quartz-350 shrink-0 ml-auto transition-transform duration-200',
            isOpen && 'rotate-180',
          )}
        />
      </button>

      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-in-out',
          isOpen
            ? 'grid-rows-[1fr] border-t border-border py-3'
            : 'grid-rows-[0fr]',
        )}
      >
        <dl className="overflow-hidden space-y-2">
          <CardRow label="Extension:" value={registrationPeriod} />
          <CardRow
            label="New expiry:"
            value={newExpiryFormatted}
            valueClassName="font-semibold text-quartz-900"
          />
          <hr className="border-border" />
          <CardRow label={priceLabel} value={priceValue} />
          <CardRow label="Subtotal:" value={subtotal} />
        </dl>
      </div>
    </div>
  )
}

type CardRowProps = {
  readonly label: string
  readonly value: string
  readonly valueClassName?: string
}

const CardRow = ({ label, value, valueClassName }: CardRowProps) => (
  <div className="flex items-center justify-between px-4">
    <dt className="text-sm text-quartz-350">{label}</dt>
    <dd className={cn('text-sm text-quartz-900 m-0', valueClassName)}>
      {value}
    </dd>
  </div>
)

type MultiNameSummaryCardSkeletonProps = {
  readonly name: string
}

export const MultiNameSummaryCardSkeleton = ({
  name,
}: MultiNameSummaryCardSkeletonProps) => (
  <div className="border border-border rounded-lg px-4 py-3 flex items-center gap-3">
    <NameAvatar name={name} height="32px" width="32px" rounded="rounded-md" />
    <span className="flex-1 text-sm font-medium text-quartz-900 truncate">
      {name}
    </span>
    <Skeleton className="h-4 w-20" />
    <ChevronDown className="size-4 text-quartz-350 shrink-0" />
  </div>
)
