import { cn } from '@/lib/utils'

export const profileCardCopyIconClassName =
  'ml-0 size-6 shrink-0 text-ens-quartz-400 xl:text-ens-quartz-700'

// Material arrow_outward from the profile frame: 24px, light weight, quartz-900.
export const profileCardArrowClassName =
  'ms-opsz-24 ms-wght-300 shrink-0 text-[24px] leading-5 text-ens-quartz-900'

export const profileRecordGridClassName =
  'grid grid-cols-2 gap-3 xl:grid-cols-3 xl:gap-6'

// A leftover card in the two-column mobile grid spans the row and sits beside its icon.
export const profileRecordGridItemClassName = (index: number, count: number) =>
  index === count - 1 && count % 2 === 1
    ? 'col-span-2 self-start xl:col-span-1 xl:self-stretch'
    : undefined

export const profileFieldLabelClassName =
  'font-sans text-ens-quartz-500 text-[11px] leading-[16.5px] tracking-[-0.121px] xl:text-xs xl:leading-4.5 xl:tracking-[-0.132px]'
export const profileFieldValueClassName =
  'font-sans text-ens-quartz-500 text-[13px] leading-[19.5px] tracking-[-0.143px] xl:text-sm xl:text-ens-quartz-700 xl:leading-6 xl:tracking-[-0.154px]'

export const profileCardTrailingIconStrokeWidth = 1.33

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
    <div className="mt-3">{children}</div>
  </section>
)
