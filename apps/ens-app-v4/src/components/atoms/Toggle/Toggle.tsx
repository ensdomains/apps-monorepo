import { type ComponentPropsWithoutRef, forwardRef } from 'react'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

export interface ToggleProps extends ComponentPropsWithoutRef<typeof Switch> {
  label?: string
  description?: string
}

export const Toggle = forwardRef<React.ElementRef<typeof Switch>, ToggleProps>(
  ({ label, description, className, id, ...props }, ref) => {
    const toggleId = id || `toggle-${Math.random().toString(36).substr(2, 9)}`

    return (
      <div className={cn('flex items-start space-x-3', className)}>
        <Switch ref={ref} id={toggleId} {...props} />
        {(label || description) && (
          <div className="grid gap-1.5 leading-none">
            {label && (
              <Label
                htmlFor={toggleId}
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                {label}
              </Label>
            )}
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </div>
        )}
      </div>
    )
  },
)

Toggle.displayName = 'Toggle'
