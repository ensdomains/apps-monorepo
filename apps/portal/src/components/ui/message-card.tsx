import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const messageCardVariants = cva(
  'rounded-lg p-8 sm:min-w-96 xl:min-w-[640px] flex flex-col items-center gap-4 relative max-w-2xl mx-auto my-4',
  {
    variants: {
      variant: {
        primary:
          'bg-lapis-100 **:data-[slot=icon]:text-lapis-500 **:data-[slot=title]:text-lapis-500 **:data-[slot=button]:text-lapis-500 **:data-[slot=button]:hover:text-lapis-500',
        success:
          'bg-peridot-100 **:data-[slot=icon]:text-peridot-500 **:data-[slot=title]:text-peridot-500 **:data-[slot=button]:text-peridot-500 **:data-[slot=button]:hover:text-peridot-500',
        danger:
          'bg-garnet-100 **:data-[slot=icon]:text-garnet-500 **:data-[slot=title]:text-garnet-500 **:data-[slot=button]:text-garnet-500 **:data-[slot=button]:hover:text-garnet-500',
        warning:
          'bg-citrine-100 **:data-[slot=icon]:text-citrine-500 **:data-[slot=title]:text-citrine-500 **:data-[slot=button]:text-citrine-500 **:data-[slot=button]:hover:text-citrine-500',
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

        <h2 data-slot="title" className="text-2xl font-bold">
          {title}
        </h2>

        <div className="text-base leading-relaxed wrap-break-word whitespace-normal max-w-full overflow-wrap-anywhere text-quartz-900">
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
