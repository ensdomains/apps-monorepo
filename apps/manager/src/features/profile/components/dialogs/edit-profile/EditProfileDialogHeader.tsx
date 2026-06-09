import { Trans } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import * as ImageFallback from '@/components/atoms/ImageFallback'
import { PatternAvatar } from '@/components/atoms/PatternAvatar/PatternAvatar'
import { DialogClose, DialogTitle } from '@/components/ui/dialog'
import { parseAvatarQuery } from '@/features/profile/service/profileAvatar'
import { useEditProfileDialogStatus } from './EditProfileDialog.context'

interface EditProfileDialogHeaderProps {
  readonly avatarUrl?: string
  readonly canSave: boolean
  readonly name: string
  readonly onSave: () => void
}

export const EditProfileDialogHeader = ({
  avatarUrl,
  canSave,
  name,
  onSave,
}: EditProfileDialogHeaderProps) => {
  const { isSaving } = useEditProfileDialogStatus()
  const resolvedAvatar = useQuery({
    ...parseAvatarQuery(avatarUrl),
    enabled: !!avatarUrl,
  })
  const displayAvatarUrl = resolvedAvatar.data ?? avatarUrl

  return (
    <div className="flex shrink-0 items-center justify-between p-6">
      <div className="flex min-w-0 items-center gap-1">
        <div className="size-9.75 shrink-0 overflow-hidden rounded-sm">
          <ImageFallback.Root className="contents">
            {displayAvatarUrl ? (
              <ImageFallback.Image
                alt={`${name} avatar`}
                className="h-full w-full object-cover"
                src={displayAvatarUrl}
              />
            ) : null}
            <ImageFallback.Fallback>
              <PatternAvatar
                className="border-none p-0 shadow-none"
                name={name}
              />
            </ImageFallback.Fallback>
          </ImageFallback.Root>
        </div>
        <DialogTitle className="max-w-104 truncate rounded-sm border border-ens-lapis-500 px-2 py-1.5 font-medium font-semi-mono text-[28px] text-ens-lapis-500 leading-[0.96] tracking-[-0.595px]">
          {name}
        </DialogTitle>
      </div>
      <div className="flex items-center gap-3">
        <DialogClose asChild>
          <button
            className="rounded-sm px-[15.419px] py-3 font-medium font-mono text-[#404040] text-[12px] uppercase leading-normal tracking-[0.96px] transition-colors hover:bg-ens-quartz-50 disabled:pointer-events-none disabled:opacity-50"
            disabled={isSaving}
            type="button"
          >
            <Trans>Cancel</Trans>
          </button>
        </DialogClose>
        <button
          className="flex items-center gap-3 rounded-sm bg-ens-lapis-500 px-[15.419px] py-3 font-medium font-mono text-[12px] text-white uppercase leading-normal tracking-[0.96px] transition-colors hover:bg-ens-lapis-core disabled:pointer-events-none disabled:opacity-50"
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
}
