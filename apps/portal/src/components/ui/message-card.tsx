import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const messageCardVariants = cva(
  'rounded-2xl p-6 sm:min-w-96 xl:min-w-160 flex flex-col items-center gap-4 relative max-w-2xl mx-auto my-4 **:data-[slot=button]:dark:hover:bg-white/10',
  {
    variants: {
      variant: {
        primary:
          'bg-accent-fill **:data-[slot=icon]:text-accent-text **:data-[slot=title]:text-accent-text',
        success:
          'bg-message-success-fill **:data-[slot=icon]:text-message-success-text **:data-[slot=title]:text-message-success-text',
        danger:
          'bg-message-danger-fill **:data-[slot=icon]:text-message-danger-text **:data-[slot=title]:text-message-danger-text',
        warning:
          'bg-message-warning-fill **:data-[slot=icon]:text-message-warning-text **:data-[slot=title]:text-message-warning-text',
      },
    },
    defaultVariants: {
      variant: 'primary',
    },
  },
)

export type MessageCardVariant = NonNullable<
  VariantProps<typeof messageCardVariants>['variant']
>

export type MessageCardProps = {
  icon: React.ReactNode
  title: string
  titleClassName?: string
  description: React.ReactNode
  descriptionClassName?: string
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
  titleClassName,
  description,
  descriptionClassName,
  variant = 'primary',
  badge,
  actionButton,
  className,
}: MessageCardProps) {
  return (
    <div
      data-slot="message-card"
      className={cn(messageCardVariants({ variant }), className)}
    >
      {badge && (
        <Badge variant="outline" className="absolute top-4 right-4 text-xs">
          {badge}
        </Badge>
      )}

      <div className="flex flex-col items-center gap-3 text-center w-full">
        <div data-slot="icon" className="flex items-center justify-center">
          {icon}
        </div>

        <h2
          data-slot="title"
          className={cn(
            'text-[34px] font-medium leading-[1.35]',
            titleClassName,
          )}
        >
          {title}
        </h2>

        <div
          className={cn(
            'text-base leading-relaxed wrap-break-word whitespace-normal max-w-full overflow-wrap-anywhere text-foreground',
            descriptionClassName,
          )}
        >
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
