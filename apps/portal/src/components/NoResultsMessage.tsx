import { Inbox } from 'lucide-react'
import { MessageCard } from '@/components/ui/message-card'

interface NoResultsMessageProps {
  title?: string
  description?: React.ReactNode
}

export const NoResultsMessage = ({
  title = 'No results found',
  description,
}: NoResultsMessageProps) => {
  const defaultDescription = "There's nothing here yet. Check back later!"

  return (
    <MessageCard
      icon={<Inbox size={30} strokeWidth={1.5} />}
      title={title}
      description={description || defaultDescription}
    />
  )
}
