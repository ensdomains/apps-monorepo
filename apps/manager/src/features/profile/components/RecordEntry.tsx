import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { FloatingInput } from '@/components/ui/floating-input'

interface RecordEntryProps {
  name: string
  placeholder?: string
  badge?: ReactNode
  value?: string
  error?: string
  onChange?: (value: string) => void
  onBlur?: () => void
  onRemove?: () => void
}

export const RecordEntry = ({
  name,
  placeholder,
  badge,
  value,
  error,
  onChange,
  onBlur,
  onRemove,
}: RecordEntryProps) => (
  <div className="flex flex-col gap-1 pt-1">
    <div className="flex items-center gap-3">
      <FloatingInput
        aria-invalid={Boolean(error)}
        className="flex-1"
        label={name}
        labelSuffix={badge}
        onBlur={onBlur}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        value={value}
      />
      <button
        aria-label={`Remove ${name}`}
        className="text-muted-foreground transition-colors hover:text-foreground"
        onClick={onRemove}
        type="button"
      >
        <X className="size-3" />
      </button>
    </div>
    {error && <p className="text-destructive text-xs">{error}</p>}
  </div>
)
