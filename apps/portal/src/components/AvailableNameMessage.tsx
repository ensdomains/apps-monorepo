import { BadgeCheck } from 'lucide-react'
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
    <div className="text-base">
      <p>
        You're using an early version of the new ENS Explorer! This Alpha is in
        active development, and registration is coming soon.
      </p>
      <p> Instead, you can register this name in the new Manager Alpha. </p>
    </div>
  )

  const defaultActionButton = {
    label: 'Register in Manager Alpha',
    href: 'https://app.ens.dev',
  }

  return (
    <MessageCard
      icon={<BadgeCheck size={30} strokeWidth={1.5} />}
      title={`${name} is available!`}
      description={description || defaultDescription}
      badge={badge}
      actionButton={actionButton || defaultActionButton}
    />
  )
}
