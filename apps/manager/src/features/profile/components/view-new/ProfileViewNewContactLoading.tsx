import clsx from 'clsx'
import {
  loadingCardSurfaceClassName,
  ProfileViewNewSectionLoading,
  SkeletonBlock,
} from './ProfileViewNewLoadingPrimitives'

const ContactCardLoading = ({
  shouldReduceMotion,
  valueWidth,
}: {
  readonly shouldReduceMotion: boolean
  readonly valueWidth: string
}) => (
  <div
    className={`${loadingCardSurfaceClassName} relative flex min-h-28 w-full flex-col items-start gap-2 p-4 text-left lg:landscape:min-h-33.5 lg:landscape:p-[24.25px]`}
  >
    <div className="flex w-full min-w-0 flex-col items-start gap-2">
      <div className="flex w-full items-center justify-between">
        <SkeletonBlock
          className="size-7 rounded lg:landscape:size-7.5"
          shouldReduceMotion={shouldReduceMotion}
        />
      </div>
      <SkeletonBlock
        className="h-[18px] w-18"
        shouldReduceMotion={shouldReduceMotion}
      />
    </div>
    <SkeletonBlock
      className="absolute top-4 right-4 size-5 rounded lg:landscape:top-[24.25px] lg:landscape:right-[24.25px] lg:landscape:size-7.5"
      shouldReduceMotion={shouldReduceMotion}
    />
    <SkeletonBlock
      className={clsx('h-[21px]', valueWidth)}
      shouldReduceMotion={shouldReduceMotion}
    />
  </div>
)

export const ProfileContactSectionLoading = ({
  shouldReduceMotion,
}: {
  readonly shouldReduceMotion: boolean
}) => (
  <ProfileViewNewSectionLoading
    index={1}
    shouldReduceMotion={shouldReduceMotion}
    titleWidth="w-17"
  >
    <div className="grid grid-cols-2 gap-3 lg:landscape:grid-cols-3 lg:landscape:gap-6">
      {['w-4/5', 'w-2/3', 'w-3/5'].map((width) => (
        <ContactCardLoading
          key={width}
          shouldReduceMotion={shouldReduceMotion}
          valueWidth={width}
        />
      ))}
    </div>
  </ProfileViewNewSectionLoading>
)
