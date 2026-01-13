import { ChevronDown, XIcon } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
  isGroupFullySelected,
  toggleGroupSelection,
  toggleValue,
} from '@/utils/filtering/multiSelectFilter'

export const TableMultiSelectFilter = ({
  label,
  groups,
  selectedValues,
  onChange,
  variant = 'outline',
}: {
  label: string
  groups: FilterGroup[]
  selectedValues: string[]
  onChange: (values: string[]) => void
  variant?: 'default' | 'outline'
}) => {
  const [open, setOpen] = useState(false)

  const allValues = getAllValuesFromGroups(groups)
  const selectedCount = selectedValues.length

  const handleToggle = (value: string) => {
    onChange(toggleValue(selectedValues, value))
  }

  const handleGroupSelectAll = (groupOptions: Array<{ value: string }>) => {
    const groupValues = groupOptions.map((opt) => opt.value)
    onChange(toggleGroupSelection(selectedValues, groupValues))
  }

  const isGroupAllSelected = (groupOptions: Array<{ value: string }>) => {
    const groupValues = groupOptions.map((opt) => opt.value)
    return isGroupFullySelected(selectedValues, groupValues)
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant}
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
            <h3 className="text-lg font-semibold">Filter by type</h3>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
              <XIcon className="h-4 w-4 font-bold" />
            </Button>
          </div>

          {groups.map((group) => {
            const isAllSelected = isGroupAllSelected(group.options)
            return (
              <div key={group.title} className="mb-6 last:mb-0">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold">{group.title}</h4>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => handleGroupSelectAll(group.options)}
                    className="h-auto p-0 text-xs"
                  >
                    {isAllSelected ? 'Deselect all' : 'Select all'}
                  </Button>
                </div>
                <div className="space-y-2">
                  {group.options.map((option) => {
                    const isSelected = selectedValues.includes(option.value)
                    return (
                      <div
                        key={option.value}
                        className="flex items-center gap-3 hover:bg-gray-50 p-2 rounded"
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

          <div className="mt-4 pt-4 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onChange([])
                setOpen(false)
              }}
              className="flex-1"
            >
              Reset
            </Button>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
