import { desktopActionClusterClassName } from './ProfileAction.styles'
import { SkeletonBlock } from './ProfileLoadingPrimitives'

const ActionIconButtonLoading = ({
  shouldReduceMotion,
}: {
  readonly shouldReduceMotion: boolean
}) => (
  <div className="inline-flex shrink-0 items-center justify-center rounded-[4px] bg-[#e2e8f0] p-0.5">
    <div className="flex items-center justify-center rounded-[10px] px-4 py-3.5">
      <SkeletonBlock
        className="size-3 rounded"
        shouldReduceMotion={shouldReduceMotion}
      />
    </div>
  </div>
)

const ActionTextButtonLoading = ({
  className = '',
  shouldReduceMotion,
}: {
  readonly className?: string
  readonly shouldReduceMotion: boolean
}) => (
  <div
    className={`inline-flex shrink-0 items-center justify-center rounded-[4px] bg-[#e2e8f0] p-0.5 ${className}`}
  >
    <div className="flex items-center justify-center rounded-[10px] px-4 py-3.5">
      <SkeletonBlock
        className="h-3 w-21 rounded-sm"
        shouldReduceMotion={shouldReduceMotion}
      />
    </div>
  </div>
)

export const ProfileDesktopActionsLoading = ({
  shouldReduceMotion,
}: {
  readonly shouldReduceMotion: boolean
}) => (
  <div className={desktopActionClusterClassName}>
    <ActionIconButtonLoading shouldReduceMotion={shouldReduceMotion} />
    <ActionIconButtonLoading shouldReduceMotion={shouldReduceMotion} />
    <ActionTextButtonLoading
      className="w-33"
      shouldReduceMotion={shouldReduceMotion}
    />
  </div>
)

export const ProfileActionsLoading = ({
  shouldReduceMotion,
}: {
  readonly shouldReduceMotion: boolean
}) => (
  <div className="absolute inset-x-0 top-118.5 z-30 xl:hidden">
    <div className="mx-auto flex w-full max-w-97.5 items-center justify-between px-5">
      <ActionTextButtonLoading
        className="w-34"
        shouldReduceMotion={shouldReduceMotion}
      />
      <div className="flex items-center gap-2">
        <ActionIconButtonLoading shouldReduceMotion={shouldReduceMotion} />
        <ActionIconButtonLoading shouldReduceMotion={shouldReduceMotion} />
      </div>
    </div>
  </div>
)
