import { Loader2 } from 'lucide-react'
import type * as React from 'react'
import { MessageCard } from '@/components/ui/message-card'

export type LoadingMessageProps = {
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
