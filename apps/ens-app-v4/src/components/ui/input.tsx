import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  variant?: 'default' | 'error' | 'success'
  size?: 'default' | 'sm' | 'lg'
  label?: string
  helperText?: string
  errorText?: string
  startIcon?: ReactNode
  endIcon?: ReactNode
}

function BaseInput({
  className,
  type,
  ...props
}: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-9 w-full min-w-0 rounded-sm border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  )
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      variant = 'default',
      size = 'default',
      label,
      helperText,
      errorText,
      startIcon,
      endIcon,
      className,
      id,
      ...props
    },
    ref,
  ) => {
    const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`
    const actualVariant = errorText ? 'error' : variant

    const inputClasses = cn(
      // Base styles are in BaseInput component
      size === 'sm' && 'h-8 text-sm px-3',
      size === 'lg' && 'h-12 text-lg px-4',
      actualVariant === 'error' &&
        'border-destructive focus-visible:ring-destructive',
      actualVariant === 'success' &&
        'border-green-500 focus-visible:ring-green-500',
      startIcon && 'pl-10',
      endIcon && 'pr-10',
      className,
    )

    const inputElement = (
      <div className="relative flex w-full items-center">
        {startIcon && (
          <div className="absolute left-3 z-10 flex items-center text-muted-foreground">
            {startIcon}
          </div>
        )}
        <BaseInput ref={ref} id={inputId} className={inputClasses} {...props} />
        {endIcon && (
          <div className="absolute right-3 z-10 flex items-center text-muted-foreground">
            {endIcon}
          </div>
        )}
      </div>
    )

    if (label || helperText || errorText) {
      return (
        <div className="flex flex-col gap-1">
          {label && (
            <Label htmlFor={inputId} className="text-sm font-medium">
              {label}
            </Label>
          )}
          {inputElement}
          {errorText && (
            <span className="text-sm text-destructive">{errorText}</span>
          )}
          {!errorText && helperText && (
            <span className="text-sm text-muted-foreground">{helperText}</span>
          )}
        </div>
      )
    }

    return inputElement
  },
)

Input.displayName = 'Input'
