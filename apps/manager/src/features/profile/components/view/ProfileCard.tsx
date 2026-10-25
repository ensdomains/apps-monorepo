import { cn } from '@/lib/utils'

export const profileCardCopyIconClassName =
  'ml-0 size-4 shrink-0 text-ens-quartz-400 xl:size-6 xl:text-ens-quartz-700'

export const profileCardTrailingIconStrokeWidth = 1.33

export const profileFieldLabelClassName =
  'font-sans text-ens-quartz-500 text-xs leading-[16.5px] xl:leading-4.5'
export const profileFieldValueClassName =
  'font-sans text-ens-quartz-700 text-xs leading-[19.5px] xl:text-sm xl:leading-6'

// Figma "Shadow/Card" chrome shared by every profile tile; the 0.25px hairline is the frame's value.
export const profileTileClassName =
  'rounded-xl border-[0.25px] border-ens-quartz-300 shadow-profile-tile'

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
      'px-5 py-6 xl:px-8 xl:pt-8 xl:pb-6',
      className,
    )}
  >
    <h2 className={sectionTitleClassName}>{title}</h2>
    <div className="mt-6">{children}</div>
  </section>
)
