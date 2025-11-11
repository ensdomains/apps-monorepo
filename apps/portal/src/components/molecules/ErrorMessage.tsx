import { AlertCircle } from 'lucide-react'
import { MessageCard } from '@/components/ui/message-card'

export interface ErrorMessageProps {
  title?: string
  description?: React.ReactNode
}

export function ErrorMessage({
  title = 'Something went wrong',
  description,
}: ErrorMessageProps) {
  const defaultDescription =
    description || 'Please try again or contact support if the issue persists.'

  return (
    <MessageCard
      icon={<AlertCircle size={30} strokeWidth={1.5} />}
      title={title}
      description={defaultDescription}
    />
  )
}
