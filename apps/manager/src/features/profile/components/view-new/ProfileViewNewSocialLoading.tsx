import clsx from 'clsx'
import {
  loadingCardSurfaceClassName,
  ProfileViewNewSectionLoading,
  SkeletonBlock,
} from './ProfileViewNewLoadingPrimitives'

const SocialCardLoading = ({
  shouldReduceMotion,
  valueWidth,
}: {
  readonly shouldReduceMotion: boolean
  readonly valueWidth: string
}) => (
  <div
    className={`${loadingCardSurfaceClassName} flex min-h-17 w-full items-center gap-1 p-3 text-left lg:landscape:min-h-22.75 lg:landscape:gap-2 lg:landscape:p-[24.25px]`}
  >
    <div className="flex size-5.25 shrink-0 items-center justify-center lg:landscape:size-9">
      <SkeletonBlock
        className="size-4 rounded lg:landscape:size-5"
        shouldReduceMotion={shouldReduceMotion}
      />
    </div>
    <div className="min-w-0 flex-1 lg:landscape:h-[42px]">
      <SkeletonBlock
        className="h-[18px] w-16"
        shouldReduceMotion={shouldReduceMotion}
      />
      <SkeletonBlock
        className={clsx('h-6', valueWidth)}
        shouldReduceMotion={shouldReduceMotion}
      />
    </div>
    <SkeletonBlock
      className="size-5 shrink-0 rounded lg:landscape:size-7.5"
      shouldReduceMotion={shouldReduceMotion}
    />
  </div>
)

export const ProfileSocialSectionLoading = ({
  shouldReduceMotion,
}: {
  readonly shouldReduceMotion: boolean
}) => (
  <ProfileViewNewSectionLoading
    index={3}
    shouldReduceMotion={shouldReduceMotion}
    titleWidth="w-15"
  >
    <div className="grid grid-cols-2 gap-3 lg:landscape:grid-cols-3 lg:landscape:gap-6">
      {['w-2/3', 'w-3/4', 'w-7/12'].map((width) => (
        <SocialCardLoading
          key={width}
          shouldReduceMotion={shouldReduceMotion}
          valueWidth={width}
        />
      ))}
    </div>
  </ProfileViewNewSectionLoading>
)
