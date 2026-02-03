import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { FloatingInput } from '@/components/ui/floating-input'

interface RecordEntryProps {
  name: string
  placeholder?: string
  badge?: ReactNode
  value?: string
  onChange?: (value: string) => void
  onRemove?: () => void
}

export const RecordEntry = ({
  name,
  placeholder,
  badge,
  value,
  onChange,
  onRemove,
}: RecordEntryProps) => (
  <div className="flex items-center gap-3 pt-1">
    <FloatingInput
      className="flex-1"
      label={name}
      labelSuffix={badge}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      value={value}
    />
    <button
      className="text-muted-foreground transition-colors hover:text-foreground"
      onClick={onRemove}
      type="button"
    >
      <X className="size-3" />
    </button>
  </div>
)
