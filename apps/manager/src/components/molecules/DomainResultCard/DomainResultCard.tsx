import { Check, CircleArrowRight, CircleCheck, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface DomainResultCardProps {
  domainName: string
  status: 'available' | 'unavailable' | 'premium'
  price?: number
  priceLabel?: string
  onAction?: (domainName: string) => void
  className?: string
}

export const DomainResultCard = ({
  domainName,
  status,
  price,
  priceLabel = 'USD/year',
  onAction,
  className,
}: DomainResultCardProps) => {
  const handleAction = () => {
    if (status !== 'unavailable' && onAction) {
      onAction(domainName)
    }
  }

  const getStatusIcon = () => {
    switch (status) {
      case 'available':
        return (
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted">
            <Check className="h-3 w-3 text-muted-foreground" />
          </div>
        )
      case 'premium':
        return (
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted">
            <Check className="h-3 w-3 text-muted-foreground" />
          </div>
        )
      case 'unavailable':
        return (
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted">
            <X className="h-3 w-3 text-muted-foreground" />
          </div>
        )
      default:
        return null
    }
  }

  const getStatusText = () => {
    switch (status) {
      case 'available':
        return 'available'
      case 'premium':
        return 'premium'
      case 'unavailable':
        return 'unavailable'
      default:
        return null
    }
  }

  const isClickable = status !== 'unavailable'

  return (
    <button
      className={cn(
        'flex w-full items-center justify-between gap-16 rounded-lg border border-border bg-background px-4 py-4 transition-colors',
        isClickable && 'cursor-pointer hover:bg-muted',
        !isClickable && 'opacity-60',
        className,
      )}
      type="button"
      onClick={handleAction}
      disabled={!isClickable}
      onKeyDown={(e) => {
        if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          handleAction()
        }
      }}
    >
      {/* Left side: Status icon and domain info */}
      <div className="flex items-start gap-3">
        {/* Status icon */}
        <div className="flex-shrink-0">{getStatusIcon()}</div>

        {/* Domain info */}
        <div className="flex flex-col gap-1">
          {/* Domain name in badge style with less rounded corners */}
          <div className="inline-flex items-center">
            <span className="rounded-sm bg-primary px-1 py-1 font-bold text-primary-foreground text-sm">
              {domainName}
            </span>
          </div>

          {/* Status text in light gray */}
          <span className="px-1 text-muted-foreground text-sm">
            {getStatusText()}
          </span>
        </div>
      </div>

      {/* Right side: Price and arrow */}
      <div className="flex items-center gap-8">
        {/* Price */}
        {price && status !== 'unavailable' && (
          <div className="text-right">
            <div className="font-medium text-muted-foreground text-sm">
              Price
            </div>
            <div className="text-foreground text-sm">
              {price} {priceLabel}
            </div>
          </div>
        )}

        {/* Arrow for available/premium domains */}
        {isClickable && (
          <CircleArrowRight className="h-8 w-8 text-foreground" />
        )}
      </div>
    </button>
  )
}

DomainResultCard.displayName = 'DomainResultCard'
