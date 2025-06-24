import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '../../atoms/Badge'
import { Button, type ButtonProps } from '../../atoms/Button'
import { Text } from '../../atoms/Text'

export interface DomainResultCardProps {
  domainName: string
  status: 'available' | 'unavailable' | 'premium'
  price?: number
  priceLabel?: string
  actionText?: string
  actionProps?: Partial<ButtonProps>
  onAction?: (domainName: string) => void
  showCheckmark?: boolean
}

export const DomainResultCard = ({
  domainName,
  status,
  price,
  priceLabel = 'USD/year',
  actionText,
  actionProps,
  onAction,
  showCheckmark = true,
}: DomainResultCardProps) => {
  const handleAction = () => {
    onAction?.(domainName)
  }

  const getStatusBadge = () => {
    switch (status) {
      case 'available':
        return <Badge variant="available">available</Badge>
      case 'unavailable':
        return <Badge variant="unavailable">unavailable</Badge>
      case 'premium':
        return <Badge variant="premium">premium</Badge>
      default:
        return null
    }
  }

  const getActionButton = () => {
    if (status === 'unavailable') return null

    const buttonText =
      actionText || (status === 'premium' ? 'View Details' : 'Register')
    const buttonVariant = status === 'premium' ? 'secondary' : 'default'

    return (
      <Button
        variant={buttonVariant}
        size="sm"
        onClick={handleAction}
        {...actionProps}
      >
        {buttonText}
      </Button>
    )
  }

  return (
    <Card className="p-4">
      <CardContent className="flex items-center justify-between p-0">
        <div className="flex items-center gap-3">
          {showCheckmark && status === 'available' && (
            <div className="text-green-600">
              <CheckIcon />
            </div>
          )}

          <div className="flex flex-col gap-1">
            <Text weight="bold" className="text-lg">
              {domainName}
            </Text>
            <div>{getStatusBadge()}</div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {price && (
            <div className="text-right">
              <Text weight="bold" className="text-lg">
                {price} USD
              </Text>
              <Text variant="caption" color="secondary">
                {priceLabel}
              </Text>
            </div>
          )}

          {getActionButton()}
        </div>
      </CardContent>
    </Card>
  )
}

const CheckIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
    <title>Available</title>
    <path
      fillRule="evenodd"
      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
      clipRule="evenodd"
    />
  </svg>
)

DomainResultCard.displayName = 'DomainResultCard'
