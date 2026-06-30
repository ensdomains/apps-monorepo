import { useReducedMotion } from 'motion/react'
import { cn } from '@/lib/utils'

export type MigrationValuePropMedia = {
  readonly alt: string
  readonly mimeType?: string
  readonly poster?: string
  readonly src: string
  readonly type: 'image' | 'video'
}

type MigrationValuePropMediaCardProps = {
  readonly className?: string
  readonly media: MigrationValuePropMedia
}

const cardClassName =
  'relative aspect-[228/320] w-full overflow-hidden rounded-2xl border border-[rgba(25,87,128,0.12)] bg-white shadow-[0px_5.7px_8.2px_0px_rgba(90,0,36,0.18)]'

const inferMimeType = (src: string, type: 'image' | 'video') => {
  if (type === 'image') {
    if (src.endsWith('.webp')) return 'image/webp'
    if (src.endsWith('.png')) return 'image/png'
    if (src.endsWith('.jpg') || src.endsWith('.jpeg')) return 'image/jpeg'
  }

  if (src.endsWith('.webm')) return 'video/webm'
  if (src.endsWith('.mp4')) return 'video/mp4'

  return undefined
}

export const MigrationValuePropMediaCard = ({
  className,
  media,
}: MigrationValuePropMediaCardProps) => {
  const shouldReduceMotion = useReducedMotion() ?? false

  if (media.type === 'video') {
    return (
      <div className={cn(cardClassName, 'bg-[#f5f1ef]', className)}>
        {shouldReduceMotion && media.poster ? (
          <img
            alt={media.alt}
            className="pointer-events-none h-full w-full select-none object-cover"
            draggable={false}
            src={media.poster}
          />
        ) : (
          <div className="relative h-full w-full">
            <video
              aria-label={media.alt}
              autoPlay={!shouldReduceMotion}
              className="pointer-events-none h-full w-full select-none object-cover"
              draggable={false}
              loop={!shouldReduceMotion}
              muted
              playsInline
              poster={media.poster}
              preload="metadata"
            >
              <source
                src={media.src}
                type={media.mimeType ?? inferMimeType(media.src, media.type)}
              />
            </video>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={cn(cardClassName, 'bg-[#f5f1ef]', className)}>
      <div className="relative h-full w-full">
        <img
          alt={media.alt}
          className="pointer-events-none h-full w-full select-none object-cover"
          draggable={false}
          src={media.src}
        />
      </div>
    </div>
  )
}
