import { useQueries } from '@tanstack/react-query'
import { useId, useState } from 'react'
import type { Address } from 'viem'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { getV1NamesForAddressQueryOptions } from '@/features/dashboard/hooks/useV1NamesForAddress'
import { getV2NamesWithRolesForAddressQueryOptions } from '@/features/dashboard/hooks/useV2NamesWithRolesForAddress'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import type { MergedName } from '@/utils/names/mergeNamesData'
import { mergeNamesData } from '@/utils/names/mergeNamesData'

interface SelectPrimaryNameDialogProps {
  address: Address
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (name: string) => void
  currentPrimaryName: string | null
}

export function SelectPrimaryNameDialog({
  address,
  open,
  onOpenChange,
  onSelect,
  currentPrimaryName,
}: SelectPrimaryNameDialogProps) {
  const searchId = useId()
  const [search, setSearch] = useState('')
  const [selectedName, setSelectedName] = useState<string | null>(null)

  const [v1Query, v2Query] = useQueries({
    queries: [
      getV1NamesForAddressQueryOptions({ address }),
      getV2NamesWithRolesForAddressQueryOptions({ address }),
    ],
  })

  const allNames = mergeNamesData(v1Query.data, v2Query.data)
  // L1 primary name uses the default reverse record - only V1 (Sepolia) names are eligible
  const l1Names = allNames.filter((n) => n.network === 'sepolia' && n.name)
  const filteredNames = l1Names.filter(
    (n) =>
      !currentPrimaryName ||
      n.name?.toLowerCase() !== currentPrimaryName.toLowerCase(),
  )

  const searchLower = search.toLowerCase()
  const displayNames = searchLower
    ? filteredNames.filter((n) => n.name?.toLowerCase().includes(searchLower))
    : filteredNames

  const isLoading = v1Query.isLoading || v2Query.isLoading

  const handleConfirm = () => {
    if (selectedName) {
      onSelect(selectedName)
      setSelectedName(null)
      setSearch('')
      onOpenChange(false)
    }
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSelectedName(null)
      setSearch('')
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>Set primary name</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Choose a name from your owned names to set as your primary name (L1
          reverse resolution).
        </p>
        <div className="flex flex-col gap-4">
          <Input
            id={searchId}
            placeholder="Search names..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="max-h-64 overflow-y-auto rounded-md border border-border">
            {isLoading ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Loading names...
              </div>
            ) : displayNames.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                {filteredNames.length === 0
                  ? 'No eligible names. Your L1 names are already set or you have no L1 names.'
                  : 'No names match your search.'}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {displayNames.map((item) => (
                  <NameRow
                    key={item.name ?? ''}
                    item={item}
                    isSelected={selectedName === item.name}
                    onSelect={() =>
                      setSelectedName(
                        selectedName === item.name ? null : (item.name ?? null),
                      )
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedName}
            data-testid="primary-name-confirm"
          >
            Set primary name
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function NameRow({
  item,
  isSelected,
  onSelect,
}: {
  item: MergedName
  isSelected: boolean
  onSelect: () => void
}) {
  const name = item.name
  if (!name) return null

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full flex-row items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-quartz-50 ${
        isSelected ? 'bg-quartz-50' : ''
      }`}
    >
      <div
        className={`size-4 shrink-0 rounded-full border-2 ${
          isSelected ? 'border-primary bg-primary' : 'border-border'
        }`}
      />
      <NameAvatar name={name} width="24px" height="24px" rounded="rounded-sm" />
      <span className="font-mono text-sm">{name}</span>
    </button>
  )
}
