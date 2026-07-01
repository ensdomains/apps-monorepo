import { JACQUARD_PATTERN6_DYE_BLEED_OPTIONS } from '@ens-apps/weave-loader/presets'
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
}

/** Full-height, centered weave loader shown while the name fills in. */
export function CenteredWeaveLoader({
  name,
  progress,
  description,
}: CenteredWeaveLoaderProps) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 max-md:bg-white">
      <Suspense fallback={<WeaveTrackPlaceholder className="max-w-2xl" />}>
        <LazyWeaveRegistration
          animate={false}
          description={description}
          name={name}
          progress={progress}
          weaveOptions={JACQUARD_PATTERN6_DYE_BLEED_OPTIONS}
        />
      </Suspense>
    </div>
  )
}
