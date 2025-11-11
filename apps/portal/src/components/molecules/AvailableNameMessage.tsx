import { CheckCircle2 } from 'lucide-react'
import type * as React from 'react'
import { MessageCard } from '@/components/ui/message-card'

export type AvailableNameMessageProps = {
  name: string
  description?: React.ReactNode
  badge?: string
  actionButton?: {
    label: string
    onClick?: () => void
    href?: string
  }
}

export function AvailableNameMessage({
  name,
  description,
  badge = 'Alpha',
  actionButton,
}: AvailableNameMessageProps) {
  const defaultDescription = (
    <>
      You're using an early version of the new ENS Explorer! This Alpha is in
      active development, and registration is coming soon. Instead, you can{' '}
      <a href="https://app.ens.domains" className="underline decoration-dotted">
        register this name in the new Manager Alpha
      </a>
      .
    </>
  )

  const defaultActionButton = {
    label: 'Register in Manager Alpha',
    href: 'https://app.ens.domains',
  }

  return (
    <MessageCard
      icon={<CheckCircle2 size={30} strokeWidth={1.5} />}
      title={`${name} is available!`}
      description={description || defaultDescription}
      badge={badge}
      actionButton={actionButton || defaultActionButton}
    />
  )
}
