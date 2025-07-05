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
        'flex h-9 w-full min-w-0 rounded-sm border border-input bg-transparent px-3 py-1 text-base shadow-xs outline-none transition-[color,box-shadow] selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:font-medium file:text-foreground file:text-sm placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
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
            <Label htmlFor={inputId} className="font-medium text-sm">
              {label}
            </Label>
          )}
          {inputElement}
          {errorText && (
            <span className="text-destructive text-sm">{errorText}</span>
          )}
          {!errorText && helperText && (
            <span className="text-muted-foreground text-sm">{helperText}</span>
          )}
        </div>
      )
    }

    return inputElement
  },
)

Input.displayName = 'Input'
