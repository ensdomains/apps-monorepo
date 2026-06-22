import clsx from 'clsx'
import {
  loadingCardSurfaceClassName,
  ProfileViewNewSectionLoading,
  SkeletonBlock,
} from './ProfileViewNewLoadingPrimitives'

const MainAddressCardLoading = ({
  shouldReduceMotion,
}: {
  readonly shouldReduceMotion: boolean
}) => (
  <div
    className={`${loadingCardSurfaceClassName} flex h-[55px] w-full items-center justify-between gap-2 px-4 py-0 lg:landscape:h-auto lg:landscape:max-w-132.75 lg:landscape:p-[24.25px]`}
  >
    <div className="flex min-w-0 flex-1 items-center gap-2 lg:landscape:flex-wrap">
      <div className="flex min-w-0 items-center gap-2 lg:landscape:h-6.5 lg:landscape:gap-4">
        <div className="flex min-w-0 items-center gap-1">
          <SkeletonBlock
            className="size-5.5 shrink-0 rounded-full bg-ens-quartz-100 lg:landscape:size-[25.576px] lg:landscape:rounded-[4px]"
            shouldReduceMotion={shouldReduceMotion}
          />
          <SkeletonBlock
            className="h-5 w-18 lg:landscape:w-24"
            shouldReduceMotion={shouldReduceMotion}
          />
        </div>
        <SkeletonBlock
          className="h-5 w-18 lg:landscape:w-28"
          shouldReduceMotion={shouldReduceMotion}
        />
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1 lg:landscape:min-w-50">
        {['eth', 'base', 'arb', 'op'].map((id) => (
          <SkeletonBlock
            className="size-4.5 rounded-full lg:landscape:size-6.5"
            key={id}
            shouldReduceMotion={shouldReduceMotion}
          />
        ))}
      </div>
    </div>
    <SkeletonBlock
      className="size-5 shrink-0 rounded lg:landscape:size-6"
      shouldReduceMotion={shouldReduceMotion}
    />
  </div>
)

const ChainAddressCardLoading = ({
  shouldReduceMotion,
  valueWidth,
}: {
  readonly shouldReduceMotion: boolean
  readonly valueWidth: string
}) => (
  <div
    className={`${loadingCardSurfaceClassName} flex h-[65px] w-full items-center justify-between gap-1 px-3 py-0 lg:landscape:h-auto lg:landscape:min-h-[88.5px] lg:landscape:gap-2 lg:landscape:p-[24.25px]`}
  >
    <div className="flex min-w-0 items-center gap-1 lg:landscape:gap-0">
      <div className="flex size-7 shrink-0 items-center justify-center lg:landscape:size-10 lg:landscape:p-2">
        <SkeletonBlock
          className="size-6 rounded-full lg:landscape:size-7"
          shouldReduceMotion={shouldReduceMotion}
        />
      </div>
      <SkeletonBlock
        className={clsx('h-[15.4px] lg:landscape:w-[85px]', valueWidth)}
        shouldReduceMotion={shouldReduceMotion}
      />
    </div>
    <SkeletonBlock
      className="size-5 shrink-0 rounded lg:landscape:size-6"
      shouldReduceMotion={shouldReduceMotion}
    />
  </div>
)

export const ProfileAddressesSectionLoading = ({
  shouldReduceMotion,
}: {
  readonly shouldReduceMotion: boolean
}) => (
  <ProfileViewNewSectionLoading
    index={2}
    shouldReduceMotion={shouldReduceMotion}
    titleWidth="w-24"
  >
    <div className="space-y-6">
      <div>
        <SkeletonBlock
          className="mb-3 h-5 w-42"
          shouldReduceMotion={shouldReduceMotion}
        />
        <MainAddressCardLoading shouldReduceMotion={shouldReduceMotion} />
      </div>
      <div>
        <SkeletonBlock
          className="mb-3 h-5 w-43"
          shouldReduceMotion={shouldReduceMotion}
        />
        <div className="grid grid-cols-1 gap-3 min-[375px]:grid-cols-2 lg:landscape:grid-cols-3 lg:landscape:gap-6">
          {[
            { id: 'bitcoin', width: 'w-[79px]' },
            { id: 'solana', width: 'w-[79px]' },
            { id: 'fallback', width: 'w-18 lg:landscape:w-[79px]' },
          ].map(({ id, width }) => (
            <ChainAddressCardLoading
              key={id}
              shouldReduceMotion={shouldReduceMotion}
              valueWidth={width}
            />
          ))}
        </div>
      </div>
    </div>
  </ProfileViewNewSectionLoading>
)
