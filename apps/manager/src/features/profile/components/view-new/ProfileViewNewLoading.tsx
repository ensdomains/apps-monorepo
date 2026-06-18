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
  <div className="relative h-65 w-full md:h-90.25">
    <div className="absolute inset-0 overflow-hidden">
      <div className="size-full bg-linear-to-br from-ens-quartz-100 via-white to-ens-quartz-200" />
      {!shouldReduceMotion && (
        <div className="pointer-events-none absolute inset-0 animate-pulse bg-white/20" />
      )}
      <div className="absolute inset-x-0 top-0 h-full bg-linear-to-b from-[#011A25]/45 via-[#011A25]/22 to-[#011A25]/0" />
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
  <div className="flex min-w-0 items-center gap-1.5">
    <div className="flex items-center gap-1.5">
      <SkeletonBlock
        className="size-5 rounded"
        shouldReduceMotion={shouldReduceMotion}
      />
      <SkeletonBlock
        className="h-5 w-16"
        shouldReduceMotion={shouldReduceMotion}
      />
    </div>
    <div className="flex min-w-0 items-center gap-1">
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
    className="space-y-[21.7px] px-5 md:px-8"
    {...getMotionProps(shouldReduceMotion)}
  >
    <div className="space-y-[13px]">
      <ProfileNameBadgeLoading
        name={name}
        shouldReduceMotion={shouldReduceMotion}
      />
      <div className="flex max-w-full flex-wrap items-center gap-x-6 gap-y-3">
        <ProfileDetailLoading
          shouldReduceMotion={shouldReduceMotion}
          valueWidth="w-28"
        />
        <ProfileDetailLoading
          shouldReduceMotion={shouldReduceMotion}
          valueWidth="w-24"
        />
        <ProfileDetailLoading
          shouldReduceMotion={shouldReduceMotion}
          valueWidth="w-24"
        />
      </div>
    </div>

    <div className="flex flex-col gap-6 md:flex-row md:items-stretch">
      <SkeletonBlock
        className="size-37 shrink-0 rounded-xl bg-ens-quartz-100 shadow-[0_4px_16px_rgba(0,0,0,0.12)] md:size-45.5"
        isSolid
        shouldReduceMotion={shouldReduceMotion}
      />
      <div className="flex min-h-45.5 flex-1 rounded-xl border-[0.25px] border-ens-quartz-300 bg-white p-6 shadow-[0_2px_6px_rgba(0,0,0,0.06)] md:max-w-158.75">
        <div className="grid w-full gap-6 md:grid-cols-[minmax(0,1fr)_228px]">
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
          <div className="flex min-w-0 flex-col justify-start gap-1.5">
            {['timezone', 'language', 'location'].map((id, index) => (
              <div className="flex min-w-0 items-center gap-1" key={id}>
                <SkeletonBlock
                  className="size-6 rounded"
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
  <div className="relative flex min-h-33.5 w-full flex-col rounded-xl border-[0.25px] border-ens-quartz-300 bg-white p-6 text-left shadow-[0_2px_6px_rgba(0,0,0,0.06)]">
    <SkeletonBlock
      className="size-7 rounded"
      shouldReduceMotion={shouldReduceMotion}
    />
    <SkeletonBlock
      className="absolute top-6 right-6 size-5 rounded"
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
    <div className="grid gap-4 md:grid-cols-3 md:gap-6">
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
  <div className="flex h-auto w-full items-center justify-between gap-4 rounded-xl border-[0.25px] border-ens-quartz-300 bg-white px-6 py-5 shadow-[0_2px_6px_rgba(0,0,0,0.06)] md:max-w-132.75">
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex min-w-0 items-center gap-2">
        <SkeletonBlock
          className="size-6 shrink-0 rounded-[4px] bg-ens-quartz-100"
          shouldReduceMotion={shouldReduceMotion}
        />
        <SkeletonBlock
          className="h-5 w-24"
          shouldReduceMotion={shouldReduceMotion}
        />
        <SkeletonBlock
          className="h-5 w-28"
          shouldReduceMotion={shouldReduceMotion}
        />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {['eth', 'base', 'arb', 'op'].map((id) => (
          <SkeletonBlock
            className="size-6 rounded-full"
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
  <div className="flex min-h-18.5 w-full items-center justify-between gap-3 rounded-xl border-[0.25px] border-ens-quartz-300 bg-white px-6 py-5 shadow-[0_2px_6px_rgba(0,0,0,0.06)]">
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex size-10 shrink-0 items-center justify-center">
        <SkeletonBlock
          className="size-7 rounded-full"
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
        <div className="grid gap-4 md:grid-cols-3 md:gap-6">
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
  <div className="flex min-h-22.75 w-full items-center gap-3 rounded-xl border-[0.25px] border-ens-quartz-300 bg-white p-6 text-left shadow-[0_2px_6px_rgba(0,0,0,0.06)]">
    <div className="flex size-9 shrink-0 items-center justify-center">
      <SkeletonBlock
        className="size-5 rounded"
        shouldReduceMotion={shouldReduceMotion}
      />
    </div>
    <div className="min-w-0 flex-1 space-y-2">
      <SkeletonBlock
        className="h-3 w-16"
        shouldReduceMotion={shouldReduceMotion}
      />
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
    <div className="grid gap-4 md:grid-cols-3 md:gap-6">
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
  <div className="flex min-h-51.25 min-w-0 flex-col overflow-hidden rounded-xl border-[#C7C6C4] border-[0.25px] bg-white shadow-none">
    <div className="flex h-30 items-center justify-center bg-ens-quartz-100">
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
    className="md:px-12"
    index={4}
    shouldReduceMotion={shouldReduceMotion}
    titleWidth="w-13"
  >
    <div className="grid gap-4 md:grid-cols-[repeat(3,minmax(0,230px))] md:gap-6">
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
  <div className="fixed right-0 bottom-0 left-0 z-40 min-h-19.5 rounded-t-[32px] bg-white px-3 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] shadow-[0_-13px_28px_rgba(0,0,0,0.02),0_-52px_52px_rgba(0,0,0,0.02),0_-117px_70px_rgba(0,0,0,0.01)]">
    <div className="mx-auto flex max-w-226.25 items-center justify-center gap-3 overflow-x-auto">
      <SkeletonBlock
        className="size-13.5 shrink-0 rounded bg-ens-quartz-100"
        shouldReduceMotion={shouldReduceMotion}
      />
      <SkeletonBlock
        className="size-13.5 shrink-0 rounded bg-ens-quartz-100"
        shouldReduceMotion={shouldReduceMotion}
      />
      <SkeletonBlock
        className="h-13.5 w-45.75 shrink-0 rounded bg-ens-quartz-100"
        shouldReduceMotion={shouldReduceMotion}
      />
      <SkeletonBlock
        className="h-13.5 w-45.75 shrink-0 rounded border border-ens-quartz-300 bg-white"
        shouldReduceMotion={shouldReduceMotion}
      />
    </div>
  </div>
)

export const ProfileViewNewLoading = ({ name }: ProfileViewNewLoadingProps) => {
  const shouldReduceMotion = useReducedMotion() ?? false

  return (
    <div className="relative min-h-screen pb-28">
      <ProfileViewNewBannerLoading shouldReduceMotion={shouldReduceMotion} />
      <div className="-mt-17.25 relative z-10 mx-auto w-full max-w-226.25 space-y-0">
        <ProfileViewNewHeaderLoading
          name={name}
          shouldReduceMotion={shouldReduceMotion}
        />
        <div className="space-y-0 px-5 md:px-0">
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
