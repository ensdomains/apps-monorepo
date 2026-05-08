import { cva, type VariantProps } from 'class-variance-authority'
import { XIcon } from 'lucide-react'
import type * as React from 'react'

import { cn } from '@/lib/utils'

const alertVariants = cva(
  cn(
    'relative grid w-full items-start gap-y-0.5',
    'grid-cols-[0_1fr] has-[>svg,>.material-symbol]:grid-cols-[calc(var(--spacing)*4)_1fr]',
    'rounded-lg border px-4 py-3 text-sm',
    'has-[>svg,>.material-symbol]:gap-x-3',
    '[&>svg,&>.material-symbol]:size-4 [&>svg,&>.material-symbol]:translate-y-0.5 [&>svg,&>.material-symbol]:text-current',
  ),
  {
    variants: {
      variant: {
        default: 'bg-card text-card-foreground',
        destructive:
          'bg-card text-destructive *:data-[slot=alert-description]:text-destructive/90 [&>svg,&>.material-symbol]:text-current',
        warning:
          'border-amber-200 bg-amber-50 text-amber-900 *:data-[slot=alert-description]:text-amber-900/90 [&>svg,&>.material-symbol]:text-current',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return (
    <div
      aria-atomic="true"
      aria-live="assertive"
      className={cn(alertVariants({ variant }), className)}
      data-slot="alert"
      role="alert"
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'col-start-2 min-h-4',
        'line-clamp-1',
        'font-medium tracking-tight',
        className,
      )}
      data-slot="alert-title"
      {...props}
    />
  )
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'col-start-2 grid justify-items-start gap-1',
        'text-muted-foreground text-sm',
        '[&_p]:leading-relaxed',
        className,
      )}
      data-slot="alert-description"
      {...props}
    />
  )
}

function AlertClose({
  className,
  children,
  ...props
}: React.ComponentProps<'button'>) {
  return (
    <button
      className={cn(
        'absolute top-2 right-2 inline-flex size-7 items-center justify-center rounded-xs opacity-70 outline-none transition-opacity hover:opacity-100 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
        className,
      )}
      data-slot="alert-close"
      type="button"
      {...props}
    >
      {children ?? <XIcon className="size-4" />}
      <span className="sr-only">Dismiss</span>
    </button>
  )
}

export { Alert, AlertTitle, AlertDescription, AlertClose }
