import { Calligraph } from 'calligraph'
import { type ReactNode, useMemo, useState } from 'react'
import {
  HOUNDSTOOTH_SHIMMER_OPTIONS,
  NameFill,
  stepLabelForProgress,
  WEAVE_REGISTRATION_HEADLINE_NAME_GAP_MIN_PX,
  WeaveCanvas,
  type WeaveShaderOptions,
  weaveRegistrationNameFillFor,
} from '@/components/WeaveLoader'
import { cn } from '@/lib/utils'

export interface WeaveRegistrationProps {
  name: string
  progress: number
  description?: string
  animate?: boolean
  footer?: ReactNode
  weaveOptions?: WeaveShaderOptions
}

export const WeaveRegistration = ({
  name,
  progress,
  description,
  animate = true,
  footer,
  weaveOptions = HOUNDSTOOTH_SHIMMER_OPTIONS,
}: WeaveRegistrationProps) => {
  const p = Math.max(0, Math.min(1, progress / 100))
  const stepLabel = stepLabelForProgress(p)
  const [nameLineCount, setNameLineCount] = useState(1)
  const nameFillTypography = useMemo(
    () => weaveRegistrationNameFillFor(name),
    [name],
  )
  const singleLineName = nameLineCount <= 1

  return (
    <div className="flex w-full flex-col items-center gap-8">
      <div className="inline-flex min-h-40 w-full items-stretch gap-12 max-md:flex-col max-md:items-center max-md:gap-8 max-md:text-center">
        <div className="size-40 shrink-0 overflow-hidden rounded-2xl max-md:size-32">
          <WeaveCanvas options={weaveOptions} />
        </div>

        <div className="flex h-full min-h-40 w-[333px] min-w-0 flex-col max-md:w-full">
          <Calligraph
            animation="smooth"
            aria-live="polite"
            as="p"
            autoSize={false}
            className="w-full min-w-0 shrink-0 font-medium font-sans text-[32px] text-ens-quartz-450 leading-[90%] tracking-[-0.8px]"
            initial
            style={{ display: 'flex', flexWrap: 'wrap', width: '100%' }}
            trend={1}
          >
            {stepLabel}
          </Calligraph>
          <div
            aria-hidden
            className={cn('shrink-0', singleLineName ? 'flex-1' : 'flex-none')}
            style={{ minHeight: WEAVE_REGISTRATION_HEADLINE_NAME_GAP_MIN_PX }}
          />
          <NameFill
            animate={animate}
            className="mt-[18px] w-full shrink-0 whitespace-normal break-all"
            name={name}
            onLineCountChange={setNameLineCount}
            progress={p}
            {...nameFillTypography}
          />
        </div>
      </div>
      {description ? (
        <p className="text-center text-ens-gray text-sm">{description}</p>
      ) : null}
      {footer}
    </div>
  )
}
