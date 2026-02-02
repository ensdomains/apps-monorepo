import { Loader2, RefreshCw, Save, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

export const PendingChangesBar = ({
  updatesCount,
  changesCount,
  onSave,
  onDiscard,
  isSaving = false,
  isSyncing = false,
}: {
  updatesCount: number
  changesCount: number
  onSave: () => void
  onDiscard: () => void
  isSaving?: boolean
  isSyncing?: boolean
}) => {
  // Show bar when there are changes OR when syncing after save
  if (changesCount === 0 && !isSyncing) return null

  // Syncing state (after transaction, waiting for indexer)
  if (isSyncing) {
    return (
      <div className="sticky bottom-6 flex justify-center px-6 pointer-events-none">
        <div className="bg-white border border-gray-300 rounded-lg shadow-lg px-4 py-2 flex items-center gap-4 pointer-events-auto">
          <RefreshCw className="size-4 animate-spin" />
          <span className="text-sm text-gray-600">
            Syncing changes... This may take a few seconds.
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="sticky bottom-6 flex justify-center px-6 pointer-events-none">
      <div className="bg-white border border-gray-300 rounded-lg shadow-lg px-4 py-2 flex items-center gap-4 pointer-events-auto">
        <span className="text-sm text-gray-600">
          <span className="font-medium">{updatesCount} </span>
          {updatesCount === 1 ? 'update' : 'updates'}
        </span>
        <Button
          variant="outline"
          onClick={onDiscard}
          className="rounded-lg"
          disabled={isSaving}
        >
          Discard
          <X className="size-4 ml-1" />
        </Button>
        <Button onClick={onSave} className="rounded-lg" disabled={isSaving}>
          {isSaving ? (
            <>
              Saving...
              <Loader2 className="size-4 ml-1 animate-spin" />
            </>
          ) : (
            <>
              Save {changesCount} {changesCount === 1 ? 'change' : 'changes'}
              <Save className="size-4 ml-1" />
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
