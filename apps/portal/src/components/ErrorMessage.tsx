import { AlertCircle } from 'lucide-react'
import { MessageCard } from '@/components/ui/message-card'

interface ErrorMessageProps {
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
      variant="danger"
      icon={<AlertCircle size={24} strokeWidth={1.5} />}
      title={title}
      description={defaultDescription}
    />
  )
}
