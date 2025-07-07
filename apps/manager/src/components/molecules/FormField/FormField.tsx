import type { ReactNode } from 'react'
import { Input, type InputProps } from '@/components/ui/input'
import { Text } from '@/components/ui/text'

export interface FormFieldProps extends InputProps {
  name: string
  required?: boolean
  validate?: (value: string) => string | undefined
  description?: string
  children?: ReactNode
}

export const FormField = ({
  name,
  label,
  required = false,
  validate,
  description,
  helperText,
  errorText,
  children,
  ...inputProps
}: FormFieldProps) => {
  const displayLabel = required && label ? `${label} *` : label

  return (
    <div className="flex flex-col gap-2">
      {displayLabel && (
        <Text variant="bodySmall" weight="medium">
          {displayLabel}
        </Text>
      )}

      {description && (
        <Text variant="caption" color="secondary">
          {description}
        </Text>
      )}

      <Input
        name={name}
        label={undefined}
        helperText={helperText}
        errorText={errorText}
        required={required}
        {...inputProps}
      />

      {children}
    </div>
  )
}

FormField.displayName = 'FormField'
