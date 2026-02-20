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
    external?: boolean
  }
}

export function AvailableNameMessage({
  name,
  description,
  badge = 'Alpha',
  actionButton,
}: AvailableNameMessageProps) {
  // Determine if this is a .eth name (registration) or DNS name (import)
  const isEthName = name.endsWith('.eth')
  const actionUrl = isEthName
    ? `https://app.ens.dev/register?name=${name}`
    : `https://app.ens.domains/${name}/import`

  const defaultDescription = (
    <div className="text-base">
      <p>
        You're using an early version of the new ENS Explorer! This Alpha is in
        active development, and registration is coming soon.
      </p>
      <p>
        {isEthName
          ? 'Instead, you can register this name in the new Manager Alpha.'
          : 'Instead, you can import this DNS name in the new Manager Alpha.'}
      </p>
    </div>
  )

  const defaultActionButton = {
    label: isEthName ? 'Register in Manager Alpha' : 'Import in Manager Alpha',
    href: actionUrl,
    external: true,
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
