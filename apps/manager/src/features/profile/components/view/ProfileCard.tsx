import { cn } from '@/lib/utils'

export const profileCardCopyIconClassName =
  'ml-0 size-4 shrink-0 text-ens-quartz-400 profile-desktop:size-6 profile-desktop:text-ens-quartz-700'

export const profileCardTrailingIconStrokeWidth = 1.33

export const valueClassName =
  'font-mono text-sm text-ens-quartz-500 leading-normal'

const profileCardClassName =
  'border-[0.25px] border-transparent bg-transparent shadow-none'

const sectionTitleClassName =
  'font-sans text-base text-ens-quartz-900 leading-normal'

export const ProfileCard = ({
  children,
  className = '',
  title,
}: {
  readonly children: React.ReactNode
  readonly className?: string
  readonly title: React.ReactNode
}) => (
  <section
    className={cn(
      profileCardClassName,
      'profile-desktop:px-8 px-5 py-6 profile-desktop:pt-8 profile-desktop:pb-6',
      className,
    )}
  >
    <h2 className={sectionTitleClassName}>{title}</h2>
    <div className="mt-6">{children}</div>
  </section>
)
