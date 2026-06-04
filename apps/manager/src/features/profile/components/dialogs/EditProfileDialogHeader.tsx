import { Trans } from '@lingui/react/macro'
import { Loader2 } from 'lucide-react'
import { PatternAvatar } from '@/components/atoms/PatternAvatar/PatternAvatar'
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
  <div className="flex shrink-0 items-center justify-between p-6">
    <div className="flex min-w-0 items-center gap-1">
      <div className="size-[39px] shrink-0 overflow-hidden rounded-[4px]">
        <PatternAvatar className="border-none p-0 shadow-none" name={name} />
      </div>
      <DialogTitle className="max-w-[26rem] truncate rounded-[4px] border border-ens-lapis-500 px-2 py-1.5 font-medium font-semi-mono text-[29.75px] text-ens-lapis-500 leading-[0.96] tracking-[-0.595px]">
        {name}
      </DialogTitle>
    </div>
    <div className="flex items-center gap-3">
      <DialogClose asChild>
        <button
          className="rounded-[4px] px-[15.419px] py-3 font-medium font-mono text-[#404040] text-[12px] uppercase leading-normal tracking-[0.96px] transition-colors hover:bg-ens-quartz-50 disabled:pointer-events-none disabled:opacity-50"
          disabled={isSaving}
          type="button"
        >
          <Trans>Cancel</Trans>
        </button>
      </DialogClose>
      <button
        className="flex items-center gap-3 rounded-[4px] bg-ens-lapis-500 px-[15.419px] py-3 font-medium font-mono text-[12px] text-white uppercase leading-normal tracking-[0.96px] transition-colors hover:bg-ens-lapis-core disabled:pointer-events-none disabled:opacity-50"
        disabled={!canSave || isSaving}
        onClick={onSave}
        type="button"
      >
        {isSaving && <Loader2 className="size-4 animate-spin" />}
        {isSaving ? <Trans>Saving</Trans> : <Trans>Save Profile</Trans>}
      </button>
    </div>
  </div>
)
