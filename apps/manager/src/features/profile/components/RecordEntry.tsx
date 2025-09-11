import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Input } from '@/components/ui/input'

export type RecordEntryProps = {
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
  <div className="space-y-1">
    <div className="flex items-center gap-2">
      {name} {badge}
    </div>
    <div className="flex items-center gap-2">
      <Input
        className="w-full flex-1"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
      />
      <button type="button" onClick={onRemove}>
        <X className="size-4" />
      </button>
    </div>
  </div>
)
