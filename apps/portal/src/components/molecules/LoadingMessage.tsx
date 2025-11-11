import { Loader2 } from 'lucide-react'
import { MessageCard } from '@/components/ui/message-card'

export interface LoadingMessageProps {
  title?: string
  description?: React.ReactNode
}

export function LoadingMessage({
  title = 'Loading',
  description,
}: LoadingMessageProps) {
  return (
    <MessageCard
      icon={<Loader2 size={30} className="animate-spin" strokeWidth={1.5} />}
      title={title}
      description={description}
    />
  )
}
