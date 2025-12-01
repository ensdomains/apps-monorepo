import { Check, Network } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

const CHAIN_OPTIONS = [
  { id: 'sepolia', label: 'Sepolia' },
  { id: 'optimism-sepolia', label: 'Optimism Sepolia' },
  { id: 'arbitrum-sepolia', label: 'Arbitrum Sepolia' },
  { id: 'base-sepolia', label: 'Base Sepolia' },
  { id: 'linea-sepolia', label: 'Linea Sepolia' },
  { id: 'scroll-sepolia', label: 'Scroll Sepolia' },
  { id: 'namechain-sepolia', label: 'Namechain Sepolia' },
] as const

export const SelectDefaultChainsDialog = () => {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(['sepolia']),
  )

  const selections = useMemo(() => Array.from(selected), [selected])

  const toggleChain = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-center gap-2"
        >
          <Network className="h-4 w-4" />
          Select default chains
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Select default chains</DialogTitle>
          <p className="text-muted-foreground text-sm">
            Choose the chains you want to make default when viewing or editing
            this profile. You can change this anytime.
          </p>
        </DialogHeader>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {CHAIN_OPTIONS.map((chain) => {
            const isSelected = selected.has(chain.id)
            return (
              <button
                key={chain.id}
                type="button"
                onClick={() => toggleChain(chain.id)}
                className={cn(
                  'flex items-center justify-between rounded-md border px-3 py-2 text-left transition-colors',
                  isSelected
                    ? 'border-primary/70 bg-primary/5'
                    : 'hover:border-foreground/30',
                )}
              >
                <span className="font-medium text-sm">{chain.label}</span>
                {isSelected && (
                  <span className="inline-flex items-center gap-1 font-semibold text-primary text-xs">
                    <Check className="h-4 w-4" />
                    Selected
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="rounded-md bg-muted/40 px-3 py-2 text-muted-foreground text-sm">
          {selections.length > 0
            ? `Currently selected: ${selections
                .map((id) => CHAIN_OPTIONS.find((c) => c.id === id)?.label)
                .filter(Boolean)
                .join(', ')}`
            : 'No chains selected yet.'}
        </div>

        <DialogFooter>
          <Button type="button" onClick={() => setOpen(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
