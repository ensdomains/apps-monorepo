import type * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type MessageCardProps = {
  icon: React.ReactNode
  title: string
  description: React.ReactNode
  badge?: string
  actionButton?: {
    label: string
    onClick?: () => void
    href?: string
    /** Opens link in a new tab */
    external?: boolean
    variant?: React.ComponentProps<typeof Button>['variant']
  }
  className?: string
}

export function MessageCard({
  icon,
  title,
  description,
  badge,
  actionButton,
  className,
}: MessageCardProps) {
  return (
    <div
      data-slot="message-card"
      className={cn(
        'bg-gray-100 rounded-lg p-8 sm:min-w-96 xl:min-w-[640px] flex flex-col items-center gap-4 relative max-w-2xl mx-auto my-4',
        className,
      )}
    >
      {badge && (
        <Badge variant="outline" className="absolute top-4 right-4 text-xs">
          {badge}
        </Badge>
      )}

      <div className="flex flex-col items-center gap-3 text-center w-full">
        <div className="flex items-center justify-center">{icon}</div>

        <h2 className="text-2xl font-bold">{title}</h2>

        <div className="text-base leading-relaxed wrap-break-word whitespace-normal max-w-full overflow-wrap-anywhere">
          {description}
        </div>
      </div>

      {actionButton && (
        <Button
          variant={actionButton.variant || 'outline'}
          onClick={actionButton.onClick}
          asChild={!!actionButton.href}
          className="mt-2"
        >
          {actionButton.href ? (
            <a
              href={actionButton.href}
              {...(actionButton.external && {
                target: '_blank',
                rel: 'noopener noreferrer',
              })}
            >
              {actionButton.label}
            </a>
          ) : (
            actionButton.label
          )}
        </Button>
      )}
    </div>
  )
}
