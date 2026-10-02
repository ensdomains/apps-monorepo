import * as ImageFallback from '@/components/atoms/ImageFallback'
import { PatternAvatar } from '@/components/atoms/PatternAvatar/PatternAvatar'
import type { NameRowProfilePreview } from '@/features/dashboard/components/nameRowProfileRecords'
import { useNameImageUrl } from '@/features/profile/hooks/useNameImageUrl'

/** Square avatar with a generated-pattern fallback, shared across the steps. */
export const NameAvatar = ({
  preview,
  name,
  imageName = name,
}: {
  readonly preview: NameRowProfilePreview
  readonly name: string
  readonly imageName?: string
}) => {
  const avatarUrl = useNameImageUrl({
    name: imageName,
    kind: 'avatar',
    fallbackUrl: preview.avatarUrl,
  })

  return (
    <div className="relative size-9 shrink-0 overflow-hidden rounded-sm bg-ens-quartz-50">
      <ImageFallback.Root className="contents">
        <ImageFallback.Image
          alt=""
          className="size-full object-cover"
          src={avatarUrl}
        />
        <ImageFallback.Fallback>
          <PatternAvatar
            className="size-full rounded-sm border-none bg-transparent p-0 shadow-none"
            color={preview.themeColor}
            name={name}
          />
        </ImageFallback.Fallback>
      </ImageFallback.Root>
    </div>
  )
}
