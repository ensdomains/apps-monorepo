import { Loader2, Save, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

export const PendingChangesBar = ({
  updatesCount,
  changesCount,
  onSave,
  onDiscard,
  isSaving = false,
}: {
  updatesCount: number
  changesCount: number
  onSave: () => void
  onDiscard: () => void
  isSaving?: boolean
}) => {
  if (changesCount === 0) return null

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
