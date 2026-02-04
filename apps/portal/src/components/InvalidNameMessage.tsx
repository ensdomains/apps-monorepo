import { AlertTriangle } from 'lucide-react'
import { MessageCard } from '@/components/ui/message-card'

interface InvalidNameMessageProps {
  title?: string
  description?: React.ReactNode
}

export function InvalidNameMessage({
  title = 'Invalid name',
  description,
}: InvalidNameMessageProps) {
  const defaultDescription = (
    <>
      You can search for a name or address, or{' '}
      <a
        href="https://support.ens.domains/e"
        className="underline decoration-dotted"
      >
        visit our support
      </a>{' '}
      for further help.
    </>
  )

  return (
    <MessageCard
      icon={<AlertTriangle size={30} strokeWidth={1.5} />}
      title={title}
      description={description || defaultDescription}
    />
  )
}
