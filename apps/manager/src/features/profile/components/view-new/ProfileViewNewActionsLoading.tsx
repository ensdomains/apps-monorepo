import {
  desktopActionContainerClassName,
  desktopActionContainerStyle,
} from './ProfileViewNewAction.styles'
import { SkeletonBlock } from './ProfileViewNewLoadingPrimitives'

const ActionIconButtonLoading = ({
  shouldReduceMotion,
}: {
  readonly shouldReduceMotion: boolean
}) => (
  <div className="flex size-13.5 shrink-0 items-center justify-center rounded bg-white shadow-[0_2px_6px_rgba(0,0,0,0.06)]">
    <SkeletonBlock
      className="size-6 rounded"
      shouldReduceMotion={shouldReduceMotion}
    />
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
    className={`flex h-13.5 shrink-0 items-center justify-center rounded bg-white px-4 shadow-[0_2px_6px_rgba(0,0,0,0.06)] ${className}`}
  >
    <SkeletonBlock
      className="h-4 w-21 rounded-sm"
      shouldReduceMotion={shouldReduceMotion}
    />
  </div>
)

const BottomActionButtonLoading = ({
  shouldReduceMotion,
}: {
  readonly shouldReduceMotion: boolean
}) => (
  <div className="flex h-15.25 w-full max-w-87 items-center justify-center rounded border border-ens-quartz-300 bg-white lg:landscape:h-12.5 lg:landscape:w-42.75 lg:landscape:border-none">
    <SkeletonBlock
      className="h-4 w-24 rounded-sm"
      shouldReduceMotion={shouldReduceMotion}
    />
  </div>
)

export const ProfileViewNewActionsLoading = ({
  shouldReduceMotion,
}: {
  readonly shouldReduceMotion: boolean
}) => (
  <>
    <div className="absolute inset-x-0 top-118.5 z-30 lg:landscape:hidden">
      <div className="mx-auto flex w-full max-w-97.5 items-center justify-between px-5">
        <ActionTextButtonLoading
          className="w-34"
          shouldReduceMotion={shouldReduceMotion}
        />
        <div className="flex items-center gap-4">
          <ActionIconButtonLoading shouldReduceMotion={shouldReduceMotion} />
          <ActionIconButtonLoading shouldReduceMotion={shouldReduceMotion} />
        </div>
      </div>
    </div>

    <div
      className={desktopActionContainerClassName}
      style={desktopActionContainerStyle}
    >
      <div className="flex items-center gap-6">
        <ActionIconButtonLoading shouldReduceMotion={shouldReduceMotion} />
        <ActionIconButtonLoading shouldReduceMotion={shouldReduceMotion} />
      </div>
      <ActionTextButtonLoading
        className="w-33"
        shouldReduceMotion={shouldReduceMotion}
      />
    </div>

    <div className="fixed inset-x-0 bottom-0 z-40 bg-white shadow-[0_-3px_2px_rgba(220,220,220,0.25)] lg:landscape:shadow-[0_-3.24px_91px_rgba(7,28,47,0.12)]">
      <div className="mx-auto flex w-full max-w-97.5 justify-center px-5 pt-3 pb-[calc(44px+env(safe-area-inset-bottom,0))] lg:landscape:max-w-360 lg:landscape:justify-end lg:landscape:gap-3 lg:landscape:px-8 lg:landscape:py-4">
        <BottomActionButtonLoading shouldReduceMotion={shouldReduceMotion} />
      </div>
    </div>
  </>
)
