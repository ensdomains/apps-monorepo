import { RemoveSelectionIcon } from '@/assets/icons'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { MessageCard } from '@/components/ui/message-card'
import { cn } from '@/lib/utils'

interface NoResultsMessageProps {
  title?: string
  description?: React.ReactNode
  icon?: React.ReactNode
  /** Icon + description only, for empty states inside a page section */
  readonly compact?: boolean
  className?: string
}

export const NoResultsMessage = ({
  title = 'No results found',
  description,
  icon,
  compact = false,
  className,
}: NoResultsMessageProps) => {
  const defaultDescription = "There's nothing here yet. Check back later!"

  if (compact) {
    return (
      <Alert
        variant="neutral"
        role="status"
        className={cn('items-center [&>svg]:translate-y-0', className)}
      >
        {icon || <RemoveSelectionIcon />}
        <AlertDescription>{description || defaultDescription}</AlertDescription>
      </Alert>
    )
  }

  return (
    <MessageCard
      icon={icon || <RemoveSelectionIcon className="size-5" />}
      title={title}
      description={description || defaultDescription}
      className={className}
    />
  )
}
