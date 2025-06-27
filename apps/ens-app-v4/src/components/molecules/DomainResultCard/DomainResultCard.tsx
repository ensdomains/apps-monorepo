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
          <div className="flex items-center justify-center h-6 w-6 rounded-full bg-gray-100">
            <Check className="h-3 w-3 text-gray-400" />
          </div>
        )
      case 'premium':
        return (
          <div className="flex items-center justify-center h-6 w-6 rounded-full bg-gray-100">
            <Check className="h-3 w-3 text-gray-400" />
          </div>
        )
      case 'unavailable':
        return (
          <div className="flex items-center justify-center h-6 w-6 rounded-full bg-gray-100">
            <X className="h-3 w-3 text-gray-400" />
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
    <div
      className={cn(
        'flex items-center justify-between w-full gap-16 py-4 px-4 bg-white transition-colors',
        isClickable && 'hover:bg-gray-100 cursor-pointer',
        !isClickable && 'opacity-60',
        className,
      )}
      onClick={handleAction}
      role={isClickable ? 'button' : 'presentation'}
      tabIndex={isClickable ? 0 : -1}
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
            <span className="bg-black text-white px-1 py-1 rounded-md text-sm font-bold">
              {domainName}
            </span>
          </div>

          {/* Status text in light gray */}
          <span className="text-sm text-gray-400 px-1">{getStatusText()}</span>
        </div>
      </div>

      {/* Right side: Price and arrow */}
      <div className="flex items-center gap-8">
        {/* Price */}
        {price && status !== 'unavailable' && (
          <div className="text-right">
            <div className="text-sm font-medium text-gray-400">Price</div>
            <div className="text-sm text-black">
              {price} {priceLabel}
            </div>
          </div>
        )}

        {/* Arrow for available/premium domains */}
        {isClickable && <CircleArrowRight className="h-8 w-8 text-black" />}
      </div>
    </div>
  )
}

DomainResultCard.displayName = 'DomainResultCard'
