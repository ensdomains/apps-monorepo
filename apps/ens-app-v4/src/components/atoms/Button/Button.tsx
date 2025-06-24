import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from 'react'
import { Button as ShadcnButton } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | 'default'
    | 'destructive'
    | 'outline'
    | 'secondary'
    | 'ghost'
    | 'link'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  fullWidth?: boolean
  children: ReactNode
  loading?: boolean
  startIcon?: ReactNode
  endIcon?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'default',
      size = 'default',
      fullWidth = false,
      children,
      loading = false,
      startIcon,
      endIcon,
      disabled,
      className,
      ...props
    },
    ref,
  ) => {
    return (
      <ShadcnButton
        ref={ref}
        variant={variant}
        size={size}
        className={cn(
          fullWidth && 'w-full',
          loading && 'pointer-events-none',
          className,
        )}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <LoadingSpinner />}
        {!loading && startIcon && <span className="mr-2">{startIcon}</span>}
        {!loading && children}
        {!loading && endIcon && <span className="ml-2">{endIcon}</span>}
      </ShadcnButton>
    )
  },
)

Button.displayName = 'Button'

const LoadingSpinner = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    aria-label="Loading"
    className="mr-2 animate-spin"
  >
    <title>Loading</title>
    <circle
      cx="8"
      cy="8"
      r="6"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeDasharray="37.7"
      strokeDashoffset="12.6"
    />
  </svg>
)
