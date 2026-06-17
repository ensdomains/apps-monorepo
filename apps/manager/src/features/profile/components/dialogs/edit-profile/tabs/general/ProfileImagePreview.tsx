import type React from 'react'
import * as ImageFallback from '@/components/atoms/ImageFallback'
import { MSymbol } from '@/components/ui/material-symbol'
import { getEmptyLabel } from './ProfileImageField.helpers'
import type { ProfileImageKind } from './ProfileImageField.types'

interface DisplayImageProps {
  readonly alt: string
  readonly className: string
  readonly fallback: React.ReactNode
  readonly src?: string | null
}

export const DisplayImage = ({
  alt,
  className,
  fallback,
  src,
}: DisplayImageProps) => (
  <ImageFallback.Root>
    <ImageFallback.Image
      alt={alt}
      className={className}
      src={src ?? undefined}
    />
    <ImageFallback.Fallback>{fallback}</ImageFallback.Fallback>
  </ImageFallback.Root>
)

export const AvatarFallback = () => (
  <div className="flex size-25 items-center justify-center rounded-sm border border-ens-quartz-250 border-dashed bg-ens-quartz-50">
    <MSymbol
      aria-hidden="true"
      className="text-ens-quartz-380"
      style={{ fontSize: 32 }}
      symbol="face"
    />
  </div>
)

interface ProfileImagePreviewProps {
  readonly displayImage?: string | null
  readonly hasImage: boolean
  readonly kind: ProfileImageKind
  readonly name: string
}

export const ProfileImagePreview = ({
  displayImage,
  hasImage,
  kind,
  name,
}: ProfileImagePreviewProps) => {
  if (kind === 'avatar') {
    return hasImage ? (
      <DisplayImage
        alt={`${name} avatar`}
        className="block size-25 rounded-xl object-cover"
        fallback={<AvatarFallback />}
        src={displayImage}
      />
    ) : (
      <AvatarFallback />
    )
  }

  return hasImage ? (
    <DisplayImage
      alt={`${name} banner`}
      className="block h-full w-full rounded-sm object-cover"
      fallback={
        <div className="flex size-full items-center justify-center text-ens-quartz-500 text-sm">
          {getEmptyLabel(kind)}
        </div>
      }
      src={displayImage}
    />
  ) : (
    <span className="flex items-center gap-1 text-ens-quartz-500 text-xs md:gap-2 md:text-sm">
      {getEmptyLabel(kind)}
      <MSymbol aria-hidden="true" style={{ fontSize: 14 }} symbol="add" />
    </span>
  )
}
