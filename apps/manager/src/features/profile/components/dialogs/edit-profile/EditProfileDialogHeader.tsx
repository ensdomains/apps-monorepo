import { useQuery } from '@tanstack/react-query'
import * as ImageFallback from '@/components/atoms/ImageFallback'
import { PatternAvatar } from '@/components/atoms/PatternAvatar/PatternAvatar'
import { imageRecordQuery } from '@/features/profile/service/profileImageRecord'
import { getEditProfileDialogHeaderStyle } from './EditProfileDialogHeaderTheme'

interface EditProfileDialogHeaderProps {
  readonly avatarPreviewUrl?: string
  readonly avatarUrl?: string
  readonly name: string
  readonly themeColor?: string | null
}

export const EditProfileDialogHeader = ({
  avatarPreviewUrl,
  avatarUrl,
  name,
  themeColor,
}: EditProfileDialogHeaderProps) => {
  const resolvedAvatar = useQuery({
    ...imageRecordQuery(avatarUrl),
    enabled: !!avatarUrl && !avatarPreviewUrl,
  })
  const displayAvatarUrl = avatarPreviewUrl ?? resolvedAvatar.data ?? avatarUrl
  const themeVars = getEditProfileDialogHeaderStyle(themeColor)

  return (
    <div
      className="flex shrink-0 items-center justify-between px-4 pt-6 pb-1 md:p-6"
      style={themeVars}
    >
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
                color={themeVars['--theme-color']}
                name={name}
              />
            </ImageFallback.Fallback>
          </ImageFallback.Root>
        </div>
        <h2 className="flex h-9.75 max-w-[calc(100vw-7rem)] items-center truncate rounded-sm border border-(--theme-color) px-2 font-medium font-semi-mono text-(--theme-color) text-[21.25px] leading-[0.96] tracking-[-0.425px] md:max-w-104 md:text-[28px] md:tracking-[-0.595px]">
          {name}
        </h2>
      </div>
    </div>
  )
}
