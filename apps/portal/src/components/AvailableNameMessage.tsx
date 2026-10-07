import { BadgeCheck } from 'lucide-react'
import type * as React from 'react'
import { MessageCard } from '@/components/ui/message-card'
import { LEGACY_APP_BASE_URL } from '@/lib/constants/domain'

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
  className?: string
}

export function AvailableNameMessage({
  name,
  description,
  badge,
  actionButton,
  className,
}: AvailableNameMessageProps) {
  // Determine if this is a .eth name (registration) or DNS name (import)
  const isEthName = name.endsWith('.eth')
  const actionUrl = isEthName
    ? `/register?name=${name}`
    : `${LEGACY_APP_BASE_URL}/${name}/import`

  const defaultDescription = (
    <div>
      <p>
        {isEthName
          ? 'This name is available to register. Click below to claim it.'
          : 'This DNS name can be imported to ENS in the Manager.'}
      </p>
    </div>
  )

  const defaultActionButton = {
    label: isEthName ? 'Register' : 'Import in Manager',
    href: actionUrl,
    external: !isEthName,
  }

  return (
    <MessageCard
      variant="success"
      icon={<BadgeCheck size={24} strokeWidth={1.5} />}
      title={`${name} is available!`}
      description={description || defaultDescription}
      badge={badge}
      actionButton={actionButton || defaultActionButton}
      className={className}
    />
  )
}
