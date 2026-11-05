import { JACQUARD_PATTERN3_DYE_BLEED_OPTIONS } from '@ens-apps/weave-loader/presets'
import { lazy, Suspense } from 'react'
import { WeaveTrackPlaceholder } from './WeaveTrackPlaceholder'

const LazyWeaveRegistration = lazy(() =>
  import('@/features/weave-registration').then((m) => ({
    default: m.WeaveRegistration,
  })),
)

export interface CenteredWeaveLoaderProps {
  name: string
  progress: number
  description?: string
  animate?: boolean
  /** Shown under the description in the same style, whatever the stage. */
  readonly notice?: string
}

/** Full-height, centered weave loader shown while the name fills in. */
export function CenteredWeaveLoader({
  name,
  progress,
  description,
  animate = false,
  notice,
}: CenteredWeaveLoaderProps) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 max-md:bg-white">
      <Suspense fallback={<WeaveTrackPlaceholder className="max-w-2xl" />}>
        <LazyWeaveRegistration
          animate={animate}
          description={description}
          footer={
            notice ? (
              <p className="text-center text-ens-gray text-sm">{notice}</p>
            ) : undefined
          }
          name={name}
          progress={progress}
          weaveOptions={JACQUARD_PATTERN3_DYE_BLEED_OPTIONS}
        />
      </Suspense>
    </div>
  )
}
