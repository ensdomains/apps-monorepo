import type * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type MessageCardVariant = 'primary' | 'success' | 'danger' | 'warning'

const variantStyles: Record<MessageCardVariant, { bg: string; fg: string }> = {
  primary: { bg: 'bg-lapis-100', fg: 'text-lapis-500' },
  success: { bg: 'bg-peridot-100', fg: 'text-peridot-500' },
  danger: { bg: 'bg-garnet-100', fg: 'text-garnet-500' },
  warning: { bg: 'bg-citrine-100', fg: 'text-citrine-500' },
}

export type MessageCardProps = {
  icon: React.ReactNode
  title: string
  description: React.ReactNode
  variant?: MessageCardVariant
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
  variant = 'primary',
  badge,
  actionButton,
  className,
}: MessageCardProps) {
  const styles = variantStyles[variant]

  return (
    <div
      data-slot="message-card"
      className={cn(
        'rounded-lg p-8 sm:min-w-96 xl:min-w-[640px] flex flex-col items-center gap-4 relative max-w-2xl mx-auto my-4',
        styles.bg,
        className,
      )}
    >
      {badge && (
        <Badge variant="outline" className="absolute top-4 right-4 text-xs">
          {badge}
        </Badge>
      )}

      <div className="flex flex-col items-center gap-3 text-center w-full">
        <div className={cn('flex items-center justify-center', styles.fg)}>
          {icon}
        </div>

        <h2 className={cn('text-2xl font-bold', styles.fg)}>{title}</h2>

        <div className="text-base leading-relaxed wrap-break-word whitespace-normal max-w-full overflow-wrap-anywhere">
          {description}
        </div>
      </div>

      {actionButton && (
        <Button
          variant={actionButton.variant || 'outline'}
          onClick={actionButton.onClick}
          asChild={!!actionButton.href}
          className={cn('mt-2', styles.fg)}
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
