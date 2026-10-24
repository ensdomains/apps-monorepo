import { cva, type VariantProps } from 'class-variance-authority'
import {
  CircleAlert,
  CircleCheck,
  CircleX,
  Info,
  type LucideIcon,
  TriangleAlert,
} from 'lucide-react'
import {
  type ComponentProps,
  createContext,
  type ReactElement,
  use,
} from 'react'

import { cn } from '@/lib/utils'

const alertVariants = cva(
  'flex w-full items-start gap-3 rounded-lg border p-4 text-sm',
  {
    variants: {
      variant: {
        default: 'border-ens-gray-two bg-white text-ens-blue-dark',
        success:
          'border-ens-peridot-border bg-ens-peridot-bg text-ens-peridot-text-dark',
        error: 'border-ens-lapis-dust bg-ens-lapis-tint text-ens-lapis-dense',
        warning:
          'border-ens-signal-warning-400 bg-ens-signal-warning-100 text-ens-signal-warning-800',
        info: 'border-ens-lapis-dust bg-ens-lapis-bg text-ens-lapis-dense',
        // Legacy red style kept for existing callers; prefer `error`.
        destructive: 'bg-card text-destructive',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

type AlertVariant = NonNullable<VariantProps<typeof alertVariants>['variant']>

const alertDescriptionVariants = cva('', {
  variants: {
    variant: {
      default: 'text-ens-gray',
      success: 'text-ens-peridot-text-medium',
      error: 'text-ens-lapis-dense/70',
      warning: 'text-ens-signal-warning-800',
      info: 'text-ens-lapis-core',
      destructive: 'text-destructive/90',
    },
  },
})

const ALERT_ICONS: Readonly<Record<AlertVariant, LucideIcon>> = {
  default: Info,
  success: CircleCheck,
  error: CircleX,
  warning: TriangleAlert,
  info: Info,
  destructive: CircleAlert,
}

const ALERT_LIVE_REGIONS: Readonly<
  Record<
    AlertVariant,
    { readonly role: 'alert' | 'status'; readonly live: 'assertive' | 'polite' }
  >
> = {
  default: { role: 'status', live: 'polite' },
  success: { role: 'status', live: 'polite' },
  error: { role: 'alert', live: 'assertive' },
  // Warnings are standing context, not interruptions
  warning: { role: 'status', live: 'polite' },
  info: { role: 'status', live: 'polite' },
  destructive: { role: 'alert', live: 'assertive' },
}

const AlertVariantContext = createContext<AlertVariant>('default')

type AlertProps = Readonly<
  ComponentProps<'div'> & {
    variant?: AlertVariant
    /** Replaces the variant's icon; `null` renders none. */
    icon?: ReactElement | null
  }
>

const Alert = ({
  className,
  variant = 'default',
  icon,
  children,
  ...props
}: AlertProps) => {
  const DefaultIcon = ALERT_ICONS[variant]
  const iconNode =
    icon === undefined ? <DefaultIcon className="size-4" /> : icon
  const { role, live } = ALERT_LIVE_REGIONS[variant]

  return (
    <div
      aria-atomic="true"
      aria-live={live}
      className={cn(alertVariants({ variant }), className)}
      data-slot="alert"
      role={role}
      {...props}
    >
      {iconNode ? (
        <span
          aria-hidden="true"
          className={cn(
            'mt-0.5 flex shrink-0 *:size-4',
            variant === 'warning' && 'text-ens-signal-warning-700',
          )}
          data-slot="alert-icon"
        >
          {iconNode}
        </span>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <AlertVariantContext value={variant}>{children}</AlertVariantContext>
      </div>
    </div>
  )
}

const AlertTitle = ({
  className,
  ...props
}: Readonly<ComponentProps<'div'>>) => (
  <div
    className={cn('wrap-anywhere font-medium leading-5', className)}
    data-slot="alert-title"
    {...props}
  />
)

const AlertDescription = ({
  className,
  ...props
}: Readonly<ComponentProps<'div'>>) => {
  const variant = use(AlertVariantContext)

  return (
    <div
      className={cn(
        'grid min-w-0 justify-items-start gap-1',
        // Chain errors carry unbroken hex; without this they widen the alert.
        'wrap-anywhere leading-5',
        alertDescriptionVariants({ variant }),
        className,
      )}
      data-slot="alert-description"
      {...props}
    />
  )
}

export type { AlertVariant }
export { Alert, AlertDescription, AlertTitle }
