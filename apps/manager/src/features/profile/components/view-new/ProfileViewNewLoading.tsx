import clsx from 'clsx'
import { motion, useReducedMotion } from 'motion/react'

type SkeletonBlockProps = {
  readonly className?: string
  readonly isSolid?: boolean
  readonly shouldReduceMotion: boolean
}

type ProfileViewNewLoadingProps = {
  readonly name?: string
}

type ProfileViewNewSectionLoadingProps = {
  readonly children: React.ReactNode
  readonly className?: string
  readonly index: number
  readonly shouldReduceMotion: boolean
  readonly titleWidth: string
}

const easing = [0.25, 0.46, 0.45, 0.94] as const

const loadingCardSurfaceClassName =
  'rounded-[14px] border-[0.692px] border-[rgba(199,198,196,0.25)] bg-white shadow-[0_2px_6px_rgba(0,0,0,0.06)] lg:landscape:rounded-xl lg:landscape:border-[0.25px] lg:landscape:border-ens-quartz-300'

const getMotionProps = (shouldReduceMotion: boolean, delay = 0) =>
  shouldReduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        transition: {
          duration: 0.24,
          ease: easing,
          delay,
        },
      }

const SkeletonBlock = ({
  className,
  isSolid = false,
  shouldReduceMotion,
}: SkeletonBlockProps) => (
  <div
    className={clsx(
      'relative overflow-hidden rounded-md',
      isSolid ? 'bg-ens-quartz-200' : 'bg-ens-quartz-200/75',
      !shouldReduceMotion && 'animate-pulse',
      className,
    )}
  />
)

const ProfileViewNewBannerLoading = ({
  shouldReduceMotion,
}: {
  readonly shouldReduceMotion: boolean
}) => (
  <div className="relative h-74 w-full lg:landscape:h-90.25">
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute top-14 h-60 w-full bg-linear-to-br from-ens-quartz-100 via-white to-ens-quartz-200 lg:landscape:top-0 lg:landscape:h-130" />
      {!shouldReduceMotion && (
        <div className="pointer-events-none absolute top-14 h-60 w-full animate-pulse bg-white/20 lg:landscape:top-0 lg:landscape:h-130" />
      )}
    </div>
    <div className="-bottom-10 pointer-events-none absolute inset-x-0 h-62.5 bg-[linear-gradient(to_bottom,rgba(252,251,251,0)_0%,rgba(252,251,251,0)_40%,rgba(252,251,251,0.72)_72%,#FCFBFB_100%)] backdrop-blur-[8px] [mask-image:linear-gradient(to_bottom,transparent_0%,transparent_54%,black_78%,black_100%)]" />
  </div>
)

const ProfileNameBadgeLoading = ({
  name,
  shouldReduceMotion,
}: {
  readonly name?: string
  readonly shouldReduceMotion: boolean
}) => (
  <div
    className={clsx(
      'relative inline-flex max-w-full items-center overflow-hidden rounded-[3px] bg-ens-quartz-200 px-3 py-2',
      !shouldReduceMotion && 'animate-pulse',
    )}
  >
    {name ? (
      <h1 className="invisible truncate font-semi-mono text-[32px] leading-[0.96]">
        {name}
      </h1>
    ) : (
      <div className="h-[30.72px] w-56" />
    )}
  </div>
)

const ProfileDetailLoading = ({
  shouldReduceMotion,
  valueWidth,
}: {
  readonly shouldReduceMotion: boolean
  readonly valueWidth: string
}) => (
  <div className="flex min-w-0 flex-col items-start gap-0 lg:landscape:flex-row lg:landscape:items-center lg:landscape:gap-1.5">
    <div className="flex items-center gap-1.5">
      <SkeletonBlock
        className="size-5 rounded"
        shouldReduceMotion={shouldReduceMotion}
      />
      <SkeletonBlock
        className="h-5 w-14 lg:landscape:w-16"
        shouldReduceMotion={shouldReduceMotion}
      />
    </div>
    <div className="flex min-w-0 items-center gap-1 pl-6 lg:landscape:pl-0">
      <SkeletonBlock
        className={clsx('h-5', valueWidth)}
        shouldReduceMotion={shouldReduceMotion}
      />
      <SkeletonBlock
        className="size-5 rounded"
        shouldReduceMotion={shouldReduceMotion}
      />
    </div>
  </div>
)

const ProfileViewNewHeaderLoading = ({
  name,
  shouldReduceMotion,
}: {
  readonly name?: string
  readonly shouldReduceMotion: boolean
}) => (
  <motion.div
    className="relative min-h-[555px] rounded-none bg-transparent pt-[62px] shadow-none lg:landscape:min-h-0 lg:landscape:space-y-[21.7px] lg:landscape:px-8 lg:landscape:pt-0"
    {...getMotionProps(shouldReduceMotion)}
  >
    <SkeletonBlock
      className="-top-33 -translate-x-1/2 absolute left-1/2 size-45.5 rounded-[18.889px] bg-ens-quartz-100 shadow-[0_4px_16px_rgba(0,0,0,0.12)] lg:landscape:hidden"
      isSolid
      shouldReduceMotion={shouldReduceMotion}
    />
    <div className="flex flex-col items-center lg:landscape:block lg:landscape:space-y-[13px]">
      <ProfileNameBadgeLoading
        name={name}
        shouldReduceMotion={shouldReduceMotion}
      />
      <div className="mt-10 w-full px-5 lg:landscape:mt-0 lg:landscape:px-0">
        <div className="grid w-full grid-cols-3 gap-3 lg:landscape:flex lg:landscape:max-w-full lg:landscape:flex-wrap lg:landscape:items-center lg:landscape:gap-x-6 lg:landscape:gap-y-3">
          <ProfileDetailLoading
            shouldReduceMotion={shouldReduceMotion}
            valueWidth="w-15 lg:landscape:w-28"
          />
          <ProfileDetailLoading
            shouldReduceMotion={shouldReduceMotion}
            valueWidth="w-14 lg:landscape:w-24"
          />
          <ProfileDetailLoading
            shouldReduceMotion={shouldReduceMotion}
            valueWidth="w-14 lg:landscape:w-24"
          />
        </div>
      </div>
      <div className="mt-6 w-[calc(100%-40px)] border-ens-quartz-200 border-t lg:landscape:hidden" />
    </div>

    <div className="mt-[91px] flex flex-col gap-6 px-5 lg:landscape:mt-0 lg:landscape:flex-row lg:landscape:items-stretch lg:landscape:px-0">
      <SkeletonBlock
        className="hidden size-45.5 shrink-0 rounded-[18.889px] bg-ens-quartz-100 shadow-[0_4px_16px_rgba(0,0,0,0.12)] lg:landscape:block"
        isSolid
        shouldReduceMotion={shouldReduceMotion}
      />
      <div className="flex min-h-0 flex-1 rounded-none border-none bg-transparent p-0 shadow-none lg:landscape:min-h-45.5 lg:landscape:max-w-158.75 lg:landscape:rounded-xl lg:landscape:border-[0.25px] lg:landscape:border-ens-quartz-300 lg:landscape:bg-white lg:landscape:p-6 lg:landscape:shadow-[0_2px_6px_rgba(0,0,0,0.06)]">
        <div className="grid w-full gap-8 lg:landscape:grid-cols-[minmax(0,346.5px)_228px] lg:landscape:gap-3">
          <div className="min-w-0">
            <SkeletonBlock
              className="h-5 w-16"
              shouldReduceMotion={shouldReduceMotion}
            />
            <div className="mt-4 space-y-3">
              <SkeletonBlock
                className="h-4 w-full"
                shouldReduceMotion={shouldReduceMotion}
              />
              <SkeletonBlock
                className="h-4 w-5/6"
                shouldReduceMotion={shouldReduceMotion}
              />
              <SkeletonBlock
                className="h-4 w-2/3"
                shouldReduceMotion={shouldReduceMotion}
              />
            </div>
          </div>
          <div className="grid min-w-0 grid-cols-3 gap-4 lg:landscape:flex lg:landscape:flex-col lg:landscape:justify-start lg:landscape:gap-1.5">
            {['timezone', 'language', 'location'].map((id, index) => (
              <div
                className="flex min-w-0 items-start gap-1 lg:landscape:items-center"
                key={id}
              >
                <SkeletonBlock
                  className="size-5 shrink-0 rounded lg:landscape:size-6"
                  shouldReduceMotion={shouldReduceMotion}
                />
                <SkeletonBlock
                  className={clsx(
                    'h-5',
                    index === 0 ? 'w-36' : index === 1 ? 'w-24' : 'w-28',
                  )}
                  shouldReduceMotion={shouldReduceMotion}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </motion.div>
)

const ProfileViewNewSectionLoading = ({
  children,
  className = '',
  index,
  shouldReduceMotion,
  titleWidth,
}: ProfileViewNewSectionLoadingProps) => (
  <motion.section
    className={clsx(
      'border-[0.25px] border-transparent bg-transparent px-5 py-6 shadow-none lg:landscape:px-8 lg:landscape:pt-8 lg:landscape:pb-6',
      className,
    )}
    {...getMotionProps(shouldReduceMotion, index * 0.05)}
  >
    <SkeletonBlock
      className={clsx('h-5', titleWidth)}
      shouldReduceMotion={shouldReduceMotion}
    />
    <div className="mt-6">{children}</div>
  </motion.section>
)

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

const ProfileContactSectionLoading = ({
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

const ProfileAddressesSectionLoading = ({
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
          {['w-[79px]', 'w-[79px]', 'w-18 lg:landscape:w-[79px]'].map(
            (width) => (
              <ChainAddressCardLoading
                key={width}
                shouldReduceMotion={shouldReduceMotion}
                valueWidth={width}
              />
            ),
          )}
        </div>
      </div>
    </div>
  </ProfileViewNewSectionLoading>
)

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

const ProfileSocialSectionLoading = ({
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

const LinkPreviewLoading = ({
  shouldReduceMotion,
  valueWidth,
}: {
  readonly shouldReduceMotion: boolean
  readonly valueWidth: string
}) => (
  <div className="flex h-[205px] min-w-0 flex-col overflow-hidden rounded-[14px] border-[0.692px] border-[rgba(199,198,196,0.25)] bg-white shadow-[0_2px_6px_rgba(0,0,0,0.06)] lg:landscape:rounded-xl lg:landscape:border-[#C7C6C4] lg:landscape:border-[0.25px]">
    <div className="flex h-30 shrink-0 items-center justify-center bg-ens-quartz-100">
      <SkeletonBlock
        className="size-14 rounded-xl bg-white/80 shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
        shouldReduceMotion={shouldReduceMotion}
      />
    </div>
    <div className="min-w-0 px-6 py-5">
      <SkeletonBlock
        className={clsx('h-5', valueWidth)}
        shouldReduceMotion={shouldReduceMotion}
      />
      <div className="mt-1 flex min-w-0 items-center gap-1">
        <SkeletonBlock
          className="h-5 w-24"
          shouldReduceMotion={shouldReduceMotion}
        />
        <SkeletonBlock
          className="size-4 shrink-0 rounded"
          shouldReduceMotion={shouldReduceMotion}
        />
      </div>
    </div>
  </div>
)

const ProfileLinksSectionLoading = ({
  shouldReduceMotion,
}: {
  readonly shouldReduceMotion: boolean
}) => (
  <ProfileViewNewSectionLoading
    index={4}
    shouldReduceMotion={shouldReduceMotion}
    titleWidth="w-13"
  >
    <div className="grid gap-4 lg:landscape:grid-cols-3 lg:landscape:gap-6">
      {['w-32', 'w-28', 'w-36'].map((width) => (
        <LinkPreviewLoading
          key={width}
          shouldReduceMotion={shouldReduceMotion}
          valueWidth={width}
        />
      ))}
    </div>
  </ProfileViewNewSectionLoading>
)

const ProfileViewNewActionsLoading = ({
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

export const ProfileViewNewLoading = ({ name }: ProfileViewNewLoadingProps) => {
  const shouldReduceMotion = useReducedMotion() ?? false

  return (
    <div className="relative min-h-screen bg-[#FCFBFB] pb-[calc(117px+env(safe-area-inset-bottom,0px))] lg:landscape:pb-[114px]">
      <ProfileViewNewBannerLoading shouldReduceMotion={shouldReduceMotion} />
      <div className="-mt-[84px] lg:landscape:-mt-[69px] relative z-10 mx-auto w-full max-w-[390px] space-y-0 lg:landscape:max-w-226.25">
        <ProfileViewNewHeaderLoading
          name={name}
          shouldReduceMotion={shouldReduceMotion}
        />
        <div className="space-y-0">
          <ProfileContactSectionLoading
            shouldReduceMotion={shouldReduceMotion}
          />
          <ProfileAddressesSectionLoading
            shouldReduceMotion={shouldReduceMotion}
          />
          <ProfileSocialSectionLoading
            shouldReduceMotion={shouldReduceMotion}
          />
          <ProfileLinksSectionLoading shouldReduceMotion={shouldReduceMotion} />
        </div>
      </div>
      <ProfileViewNewActionsLoading shouldReduceMotion={shouldReduceMotion} />
    </div>
  )
}
