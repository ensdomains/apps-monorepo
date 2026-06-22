import { SkeletonBlock } from './ProfileViewNewLoadingPrimitives'

export const ProfileViewNewActionsLoading = ({
  shouldReduceMotion,
}: {
  readonly shouldReduceMotion: boolean
}) => (
  <>
    <div className="absolute inset-x-0 top-[474px] z-30 lg:landscape:hidden">
      <div className="mx-auto flex w-full max-w-[390px] items-center justify-between px-5">
        <SkeletonBlock
          className="h-13.5 w-34 shrink-0 rounded bg-white shadow-[0_2px_6px_rgba(0,0,0,0.06)]"
          shouldReduceMotion={shouldReduceMotion}
        />
        <div className="flex items-center gap-4">
          <SkeletonBlock
            className="size-13.5 shrink-0 rounded bg-white shadow-[0_2px_6px_rgba(0,0,0,0.06)]"
            shouldReduceMotion={shouldReduceMotion}
          />
          <SkeletonBlock
            className="size-13.5 shrink-0 rounded bg-white shadow-[0_2px_6px_rgba(0,0,0,0.06)]"
            shouldReduceMotion={shouldReduceMotion}
          />
        </div>
      </div>
    </div>

    <div className="absolute top-79 right-8 z-30 hidden w-33 flex-col gap-6 lg:landscape:flex">
      <div className="flex items-center gap-6">
        <SkeletonBlock
          className="size-13.5 shrink-0 rounded bg-white shadow-[0_2px_6px_rgba(0,0,0,0.06)]"
          shouldReduceMotion={shouldReduceMotion}
        />
        <SkeletonBlock
          className="size-13.5 shrink-0 rounded bg-white shadow-[0_2px_6px_rgba(0,0,0,0.06)]"
          shouldReduceMotion={shouldReduceMotion}
        />
      </div>
      <SkeletonBlock
        className="h-13.5 w-33 shrink-0 rounded bg-white shadow-[0_2px_6px_rgba(0,0,0,0.06)]"
        shouldReduceMotion={shouldReduceMotion}
      />
    </div>

    <div className="fixed inset-x-0 bottom-0 z-40 bg-white shadow-[0_-3px_2px_rgba(220,220,220,0.25)] lg:landscape:shadow-[0_-3.24px_91px_rgba(7,28,47,0.12)]">
      <div className="mx-auto flex w-full max-w-[390px] justify-center px-5 pt-3 pb-[calc(44px+env(safe-area-inset-bottom,0px))] lg:landscape:max-w-[1440px] lg:landscape:justify-end lg:landscape:gap-3 lg:landscape:px-8 lg:landscape:py-4">
        <SkeletonBlock
          className="h-[61px] w-full max-w-[348px] rounded border border-ens-quartz-300 bg-white lg:landscape:h-12.5 lg:landscape:w-[171px] lg:landscape:border-none lg:landscape:bg-white"
          shouldReduceMotion={shouldReduceMotion}
        />
      </div>
    </div>
  </>
)
