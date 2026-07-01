import type { Address } from 'viem'
import * as ImageFallback from '@/components/atoms/ImageFallback'
import { PatternAvatar } from '@/components/atoms/PatternAvatar/PatternAvatar'
import { RenewNameButton } from '@/features/renew/components/RenewNameButton'
import { useProfileImageVersion } from '../../hooks/useProfileImageVersion'
import {
  buildNameAvatarUrl,
  buildNameHeaderUrl,
} from '../../service/profileAvatar'
import { safeImageSrc } from '../../utils/safeUrl'
import { ProfileHeaderInfo } from '../common/ProfileHeaderInfo'
import { ShareProfileDialog } from '../dialogs/ShareProfileDialog'
import { FavoriteButton } from './FavoriteButton'

interface ViewHeaderSectionProps {
  name: string
  owner?: Address
  isInGrace?: boolean
  isOwner?: boolean
  themeColor?: string
}

export const ViewHeaderSection = ({
  name,
  owner,
  isInGrace = false,
  isOwner,
  themeColor,
}: ViewHeaderSectionProps) => {
  const avatarVersion = useProfileImageVersion({ kind: 'avatar', name })
  const headerVersion = useProfileImageVersion({ kind: 'header', name })
  const avatarUrl = isInGrace
    ? undefined
    : safeImageSrc(buildNameAvatarUrl(name, avatarVersion))
  const headerUrl = isInGrace
    ? undefined
    : safeImageSrc(buildNameHeaderUrl(name, headerVersion))

  const url = `${
    typeof window === 'undefined'
      ? 'https://app.ens.domains'
      : window.location.origin
  }/p/${name}`

  return (
    <div className="overflow-hidden rounded-xl border-[0.25px] border-border bg-white shadow-none">
      {/* Header BG */}
      <div className="relative w-full">
        <ImageFallback.Root className="aspect-3/1 w-full md:aspect-5/1">
          {isInGrace ? null : (
            <ImageFallback.Image
              alt={`${name} header`}
              className="size-full object-cover"
              src={headerUrl}
            />
          )}
          <ImageFallback.Fallback>
            <div
              className="size-full"
              style={{
                backgroundImage:
                  'linear-gradient(162deg, transparent 21.72%, var(--color-muted) 62.7%)',
              }}
            />
          </ImageFallback.Fallback>
        </ImageFallback.Root>
        <div className="absolute top-4 left-4 flex items-center gap-2">
          <RenewNameButton isOwner={isOwner} name={name} />
        </div>
        <div className="absolute top-4 right-4 flex items-center gap-2">
          <FavoriteButton name={name} />
          <ShareProfileDialog avatarUrl={avatarUrl} name={name} url={url} />
        </div>
        <div className="absolute -bottom-10 left-1/2 size-24 -translate-x-1/2 md:size-36 lg:size-40">
          <div className="size-full overflow-hidden rounded-xl bg-gray-200 shadow-md ring-2 ring-white">
            <ImageFallback.Root className="contents">
              {isInGrace ? null : (
                <ImageFallback.Image
                  alt={`${name} avatar`}
                  className="h-full w-full object-cover"
                  src={avatarUrl}
                />
              )}
              <ImageFallback.Fallback>
                <PatternAvatar
                  className="size-full rounded-xl border-none bg-transparent p-0 shadow-none"
                  color={themeColor}
                  name={name}
                />
              </ImageFallback.Fallback>
            </ImageFallback.Root>
          </div>
        </div>
      </div>
      <ProfileHeaderInfo name={name} owner={owner} />
    </div>
  )
}
