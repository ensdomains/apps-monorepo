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
        'bg-gray-100 rounded-lg p-8 sm:min-w-96 flex flex-col items-center gap-4 relative max-w-2xl mx-auto my-4',
        className,
      )}
    >
      {badge && (
        <Badge variant="secondary" className="absolute top-4 right-4">
          {badge}
        </Badge>
      )}

      <div className="flex flex-col items-center gap-4 text-center w-full">
        <div className="flex items-center justify-center text-black">
          {icon}
        </div>

        <h2 className="text-2xl font-bold text-black">{title}</h2>

        <div className="text-base text-black max-w-md leading-relaxed">
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
            <a href={actionButton.href}>{actionButton.label}</a>
          ) : (
            actionButton.label
          )}
        </Button>
      )}
    </div>
  )
}
