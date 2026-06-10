import { Calligraph } from 'calligraph'
import type { ReactNode } from 'react'
import {
  HOUNDSTOOTH_SHIMMER_OPTIONS,
  NameFill,
  stepLabelForProgress,
  WeaveCanvas,
} from '@/components/WeaveLoader'

export interface WeaveRegistrationProps {
  name: string
  progress: number
  description?: string
  animate?: boolean
  footer?: ReactNode
}

export const WeaveRegistration = ({
  name,
  progress,
  description,
  animate = true,
  footer,
}: WeaveRegistrationProps) => {
  const p = Math.max(0, Math.min(1, progress / 100))
  const stepLabel = stepLabelForProgress(p)

  return (
    <div className="flex flex-col items-center gap-8">
      <div className="inline-flex items-start gap-12 max-md:flex-col max-md:items-center max-md:gap-8 max-md:text-center">
        <div className="size-40 shrink-0 overflow-hidden rounded-2xl max-md:size-32">
          <WeaveCanvas options={HOUNDSTOOTH_SHIMMER_OPTIONS} />
        </div>

        <div className="flex h-40 w-[333px] min-w-0 flex-col justify-between max-md:h-auto max-md:min-h-32 max-md:w-auto max-md:gap-6">
          <Calligraph
            animation="smooth"
            aria-live="polite"
            as="p"
            autoSize={false}
            className="font-medium font-sans text-[32px] text-ens-quartz-450 leading-[90%] tracking-[-0.8px]"
            initial
            trend={1}
          >
            {stepLabel}
          </Calligraph>
          <NameFill
            animate={animate}
            baseColor="var(--color-ens-gray-two)"
            className="whitespace-normal break-all"
            fill="#000"
            fontFamily="var(--font-mono)"
            fontSize={31.68}
            fontWeight={500}
            letterSpacing="-1.2672px"
            lineHeight="90%"
            name={name}
            progress={p}
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
