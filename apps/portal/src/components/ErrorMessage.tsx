import { Frown } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { MessageCard } from '@/components/ui/message-card'

interface ErrorMessageProps {
  title?: string
  description?: React.ReactNode
  /** Icon + description only, for errors inside a page section */
  compact?: boolean
  className?: string
}

export function ErrorMessage({
  title = 'Error loading page',
  description,
  compact = false,
  className,
}: ErrorMessageProps) {
  if (compact) {
    return (
      <Alert variant="destructive" className={className}>
        <Frown strokeWidth={1.5} />
        <AlertDescription>
          {description || 'Error fetching data. Please refresh the page.'}
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <MessageCard
      variant="danger"
      icon={<Frown size={24} strokeWidth={1.5} />}
      title={title}
      description={
        description ||
        'This page could not be loaded. Try refreshing the page and check the console log for detailed information.'
      }
      className={className}
    />
  )
}
