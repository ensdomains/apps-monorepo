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
  'rounded-[14px] border-[0.692px] border-[rgba(199,198,196,0.25)] bg-white shadow-[0_2px_6px_rgba(0,0,0,0.06)] md:rounded-xl md:border-[0.25px] md:border-ens-quartz-300'

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
  <div className="relative h-74 w-full md:h-90.25">
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute top-14 h-60 w-full bg-linear-to-br from-ens-quartz-100 via-white to-ens-quartz-200 md:top-0 md:h-130" />
      {!shouldReduceMotion && (
        <div className="pointer-events-none absolute top-14 h-60 w-full animate-pulse bg-white/20 md:top-0 md:h-130" />
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
  <div className="flex min-w-0 flex-col items-start gap-0 md:flex-row md:items-center md:gap-1.5">
    <div className="flex items-center gap-1.5">
      <SkeletonBlock
        className="size-5 rounded"
        shouldReduceMotion={shouldReduceMotion}
      />
      <SkeletonBlock
        className="h-5 w-14 md:w-16"
        shouldReduceMotion={shouldReduceMotion}
      />
    </div>
    <div className="flex min-w-0 items-center gap-1 pl-6 md:pl-0">
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
    className="relative min-h-[555px] rounded-b-xl bg-white pt-[62px] shadow-[0_4px_24.1px_rgba(7,28,47,0.07)] md:min-h-0 md:space-y-[21.7px] md:rounded-none md:bg-transparent md:px-8 md:pt-0 md:shadow-none"
    {...getMotionProps(shouldReduceMotion)}
  >
    <SkeletonBlock
      className="-top-33 -translate-x-1/2 absolute left-1/2 size-45.5 rounded-[18.889px] bg-ens-quartz-100 shadow-[0_4px_16px_rgba(0,0,0,0.12)] md:hidden"
      isSolid
      shouldReduceMotion={shouldReduceMotion}
    />
    <div className="flex flex-col items-center md:block md:space-y-[13px]">
      <ProfileNameBadgeLoading
        name={name}
        shouldReduceMotion={shouldReduceMotion}
      />
      <div className="mt-10 w-full px-5 md:mt-0 md:px-0">
        <div className="grid w-full grid-cols-3 gap-3 md:flex md:max-w-full md:flex-wrap md:items-center md:gap-x-6 md:gap-y-3">
          <ProfileDetailLoading
            shouldReduceMotion={shouldReduceMotion}
            valueWidth="w-15 md:w-28"
          />
          <ProfileDetailLoading
            shouldReduceMotion={shouldReduceMotion}
            valueWidth="w-14 md:w-24"
          />
          <ProfileDetailLoading
            shouldReduceMotion={shouldReduceMotion}
            valueWidth="w-14 md:w-24"
          />
        </div>
      </div>
      <div className="mt-6 w-[calc(100%-40px)] border-ens-quartz-200 border-t md:hidden" />
    </div>

    <div className="mt-[91px] flex flex-col gap-6 px-5 md:mt-0 md:flex-row md:items-stretch md:px-0">
      <SkeletonBlock
        className="hidden size-45.5 shrink-0 rounded-[18.889px] bg-ens-quartz-100 shadow-[0_4px_16px_rgba(0,0,0,0.12)] md:block"
        isSolid
        shouldReduceMotion={shouldReduceMotion}
      />
      <div className="flex min-h-0 flex-1 rounded-none border-none bg-transparent p-0 shadow-none md:min-h-45.5 md:max-w-158.75 md:rounded-xl md:border-[0.25px] md:border-ens-quartz-300 md:bg-white md:p-6 md:shadow-[0_2px_6px_rgba(0,0,0,0.06)]">
        <div className="grid w-full gap-8 md:grid-cols-[minmax(0,346.5px)_228px] md:gap-3">
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
          <div className="grid min-w-0 grid-cols-3 gap-4 md:flex md:flex-col md:justify-start md:gap-1.5">
            {['timezone', 'language', 'location'].map((id, index) => (
              <div
                className="flex min-w-0 items-start gap-1 md:items-center"
                key={id}
              >
                <SkeletonBlock
                  className="size-5 shrink-0 rounded md:size-6"
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
      'border-[0.25px] border-transparent bg-transparent px-5 py-6 shadow-none md:px-8 md:pt-8 md:pb-6',
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
    className={`${loadingCardSurfaceClassName} relative flex min-h-28 w-full flex-col p-4 text-left md:min-h-33.5 md:p-6`}
  >
    <SkeletonBlock
      className="size-7 rounded"
      shouldReduceMotion={shouldReduceMotion}
    />
    <SkeletonBlock
      className="absolute top-4 right-4 size-5 rounded md:top-6 md:right-6"
      shouldReduceMotion={shouldReduceMotion}
    />
    <div className="mt-auto min-w-0 space-y-2 pt-4">
      <SkeletonBlock
        className="h-3 w-18"
        shouldReduceMotion={shouldReduceMotion}
      />
      <SkeletonBlock
        className={clsx('h-5', valueWidth)}
        shouldReduceMotion={shouldReduceMotion}
      />
    </div>
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
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-6">
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
    className={`${loadingCardSurfaceClassName} flex h-[55px] w-full items-center justify-between gap-2 px-4 py-0 md:h-auto md:max-w-132.75 md:gap-4 md:px-6 md:py-5`}
  >
    <div className="flex min-w-0 flex-1 items-center gap-x-2 gap-y-2 md:flex-wrap md:gap-x-4">
      <div className="flex min-w-0 items-center gap-2">
        <SkeletonBlock
          className="size-5.5 shrink-0 rounded-full bg-ens-quartz-100 md:size-6 md:rounded-[4px]"
          shouldReduceMotion={shouldReduceMotion}
        />
        <SkeletonBlock
          className="h-5 w-18 md:w-24"
          shouldReduceMotion={shouldReduceMotion}
        />
        <SkeletonBlock
          className="h-5 w-18 md:w-28"
          shouldReduceMotion={shouldReduceMotion}
        />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {['eth', 'base', 'arb', 'op'].map((id) => (
          <SkeletonBlock
            className="size-4.5 rounded-full md:size-6"
            key={id}
            shouldReduceMotion={shouldReduceMotion}
          />
        ))}
      </div>
    </div>
    <SkeletonBlock
      className="size-5 shrink-0 rounded"
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
    className={`${loadingCardSurfaceClassName} flex h-[65px] w-full items-center justify-between gap-2 px-4 py-0 md:h-auto md:min-h-18.5 md:gap-3 md:px-6 md:py-5`}
  >
    <div className="flex min-w-0 items-center gap-2 md:gap-3">
      <div className="flex size-8 shrink-0 items-center justify-center md:size-10">
        <SkeletonBlock
          className="size-6 rounded-full md:size-7"
          shouldReduceMotion={shouldReduceMotion}
        />
      </div>
      <SkeletonBlock
        className={clsx('h-5', valueWidth)}
        shouldReduceMotion={shouldReduceMotion}
      />
    </div>
    <SkeletonBlock
      className="size-5 shrink-0 rounded"
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
    <div className="space-y-8">
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
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-6">
          {['w-28', 'w-32', 'w-24'].map((width) => (
            <ChainAddressCardLoading
              key={width}
              shouldReduceMotion={shouldReduceMotion}
              valueWidth={width}
            />
          ))}
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
    className={`${loadingCardSurfaceClassName} flex min-h-17 w-full items-center gap-1 p-3 text-left md:min-h-22.75 md:gap-2 md:p-[24.25px]`}
  >
    <div className="flex size-5.25 shrink-0 items-center justify-center md:size-9">
      <SkeletonBlock
        className="size-4 rounded md:size-5"
        shouldReduceMotion={shouldReduceMotion}
      />
    </div>
    <div className="min-w-0 flex-1 md:h-[42px]">
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
      className="size-5 shrink-0 rounded md:size-7.5"
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
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-6">
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
  <div className="flex h-[205px] min-w-0 flex-col overflow-hidden rounded-[14px] border-[0.692px] border-[rgba(199,198,196,0.25)] bg-white shadow-[0_2px_6px_rgba(0,0,0,0.06)] md:rounded-xl md:border-[#C7C6C4] md:border-[0.25px]">
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
    <div className="grid gap-4 md:grid-cols-3 md:gap-6">
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
    <div className="absolute inset-x-0 top-[474px] z-30 md:hidden">
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

    <div className="absolute top-[316px] right-8 z-30 hidden w-33 flex-col gap-6 md:flex">
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

    <div className="fixed right-0 bottom-0 left-0 z-40 h-[117px] bg-white px-6 pt-3 shadow-[0_-3px_2px_rgba(220,220,220,0.25)] md:right-8 md:bottom-4 md:left-auto md:h-auto md:bg-transparent md:p-0 md:shadow-none">
      <SkeletonBlock
        className="h-[61px] w-full rounded border border-ens-quartz-300 bg-white md:h-12.5 md:w-[171px] md:border-none md:bg-white"
        shouldReduceMotion={shouldReduceMotion}
      />
    </div>
  </>
)

export const ProfileViewNewLoading = ({ name }: ProfileViewNewLoadingProps) => {
  const shouldReduceMotion = useReducedMotion() ?? false

  return (
    <div className="relative min-h-screen bg-[#FCFBFB] pb-[117px] md:pb-28">
      <ProfileViewNewBannerLoading shouldReduceMotion={shouldReduceMotion} />
      <div className="-mt-[84px] md:-mt-[69px] relative z-10 mx-auto w-full max-w-[390px] space-y-0 md:max-w-226.25">
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
