import { ChevronDown, XIcon } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import {
  Button,
  type ButtonSize,
  type ButtonVariant,
} from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import {
  type FilterGroup,
  getAllValuesFromGroups,
  toggleValue,
} from '@/utils/filtering/multiSelectFilter'

export const TableMultiSelectFilter = ({
  label,
  groups,
  selectedValues,
  onChange,
  variant = 'outline',
  size,
}: {
  label: string
  groups: FilterGroup[]
  selectedValues: string[]
  onChange: (values: string[]) => void
  variant?: ButtonVariant
  size?: ButtonSize
}) => {
  const [open, setOpen] = useState(false)

  const allValues = getAllValuesFromGroups(groups)
  const selectedCount = selectedValues.length

  const handleToggle = (value: string) => {
    onChange(toggleValue(selectedValues, value))
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant}
          size={size}
          className="flex items-center gap-2 focus-visible:outline-none"
        >
          {label}:
          {selectedCount > 0 && selectedCount < allValues.length ? (
            <Badge className="ml-1">{selectedCount}</Badge>
          ) : (
            ' All'
          )}
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80">
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold">
                Filter by {label.toLowerCase()}
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onChange([])}
                className="h-auto px-2 py-1 text-xs text-muted-foreground"
              >
                Reset
              </Button>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
              <XIcon className="h-4 w-4 font-bold" />
            </Button>
          </div>

          {groups.map((group) => {
            const groupValues = group.options.map((opt) => opt.value)
            const hasAnySelected = groupValues.some((v) =>
              selectedValues.includes(v),
            )
            return (
              <div key={group.title} className="mb-6 last:mb-0">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold">{group.title}</h4>
                  {hasAnySelected && (
                    <Button
                      variant="link"
                      size="sm"
                      onClick={() => {
                        // Deselect all in this group
                        onChange(
                          selectedValues.filter(
                            (v) => !groupValues.includes(v),
                          ),
                        )
                      }}
                      className="h-auto p-0 text-xs text-muted-foreground"
                    >
                      Deselect all
                    </Button>
                  )}
                </div>
                <div className="space-y-2">
                  {group.options.map((option) => {
                    const isSelected = selectedValues.includes(option.value)
                    return (
                      <div
                        key={option.value}
                        className="flex items-center gap-3 hover:bg-muted p-2 rounded"
                      >
                        <Checkbox
                          id={`filter-${option.value}`}
                          checked={isSelected}
                          onCheckedChange={() => handleToggle(option.value)}
                        />
                        <Label
                          htmlFor={`filter-${option.value}`}
                          className="cursor-pointer flex-1 text-foreground"
                        >
                          {option.label}
                        </Label>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
