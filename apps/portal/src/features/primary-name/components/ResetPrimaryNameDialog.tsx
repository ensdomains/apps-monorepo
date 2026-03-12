import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface ResetPrimaryNameDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  primaryName: string
  onConfirm: () => void
  isPending?: boolean
}

export function ResetPrimaryNameDialog({
  open,
  onOpenChange,
  primaryName,
  onConfirm,
  isPending = false,
}: ResetPrimaryNameDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle className="text-amber-600">
            Reset primary name
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This will remove{' '}
          <span className="font-mono font-medium">{primaryName}</span> as your
          primary name. Your address will no longer resolve to this name on L1.
        </p>
        <div className="rounded-md bg-amber-50 p-4 text-sm text-amber-800">
          This action cannot be undone. You can set a new primary name anytime.
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isPending}
            data-testid="reset-primary-name-confirm"
          >
            {isPending ? 'Resetting...' : 'Reset primary name'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
