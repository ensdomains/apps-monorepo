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
    ? `/register?name=${name}`
    : `https://app.ens.domains/${name}/import`

  const defaultDescription = (
    <div className="text-base">
      <p>
        {isEthName
          ? 'This name is available to register. Click below to claim it.'
          : 'This DNS name can be imported to ENS in the Manager Alpha.'}
      </p>
    </div>
  )

  const defaultActionButton = {
    label: isEthName ? 'Register' : 'Import in Manager Alpha',
    href: actionUrl,
    external: !isEthName,
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
