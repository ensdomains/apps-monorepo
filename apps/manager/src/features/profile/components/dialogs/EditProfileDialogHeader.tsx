import { Trans } from '@lingui/react/macro'
import { Loader2 } from 'lucide-react'
import { PatternAvatar } from '@/components/atoms/PatternAvatar/PatternAvatar'
import { Button } from '@/components/ui/button'
import { DialogClose, DialogTitle } from '@/components/ui/dialog'

interface EditProfileDialogHeaderProps {
  readonly canSave: boolean
  readonly isSaving: boolean
  readonly name: string
  readonly onSave: () => void
}

export const EditProfileDialogHeader = ({
  canSave,
  isSaving,
  name,
  onSave,
}: EditProfileDialogHeaderProps) => (
  <div className="flex h-24 shrink-0 items-center justify-between px-8">
    <div className="flex min-w-0 items-center gap-3">
      <div className="size-10 shrink-0 overflow-hidden rounded-sm">
        <PatternAvatar className="border-none p-0 shadow-none" name={name} />
      </div>
      <DialogTitle className="max-w-[26rem] truncate rounded-sm border border-ens-blue bg-white px-3 py-1 font-mono text-2xl text-ens-blue leading-tight">
        {name}
      </DialogTitle>
    </div>
    <div className="flex items-center gap-3">
      <DialogClose asChild>
        <Button
          className="w-auto text-muted-foreground uppercase tracking-[0.18em]"
          disabled={isSaving}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Trans>Cancel</Trans>
        </Button>
      </DialogClose>
      <Button
        className="h-11 w-auto px-6 py-0 uppercase tracking-[0.18em]"
        disabled={!canSave || isSaving}
        onClick={onSave}
        type="button"
      >
        {isSaving && <Loader2 className="size-4 animate-spin" />}
        {isSaving ? <Trans>Saving</Trans> : <Trans>Save Profile</Trans>}
      </Button>
    </div>
  </div>
)
