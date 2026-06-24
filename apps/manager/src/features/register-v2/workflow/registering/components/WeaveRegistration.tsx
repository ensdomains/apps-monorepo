import { NameFill } from '@ens-apps/weave-loader/NameFill'
import { JACQUARD_PATTERN6_DYE_BLEED_OPTIONS } from '@ens-apps/weave-loader/presets'
import type { WeaveShaderOptions } from '@ens-apps/weave-loader/shader/useWeaveShader'
import { WeaveCanvas } from '@ens-apps/weave-loader/WeaveCanvas'
import {
  WEAVE_REGISTRATION_HEADLINE_NAME_GAP_MIN_PX,
  weaveRegistrationNameFillFor,
} from '@ens-apps/weave-loader/weaveNameFill'
import { useLingui } from '@lingui/react/macro'
import { Calligraph } from 'calligraph'
import { type ReactNode, useState } from 'react'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import { cn } from '@/lib/utils'
import { stepMessageForProgress } from '../lib/weaveSteps'

export interface WeaveRegistrationProps {
  name: string
  progress: number
  description?: string
  animate?: boolean
  footer?: ReactNode
  weaveOptions?: WeaveShaderOptions
}

// Calligraph sets display:flex — hide via a wrapper, not on Calligraph itself.
const WeaveRegistrationStepLabel = ({
  label,
  className,
}: {
  label: string
  className?: string
}) => (
  <Calligraph
    animation="smooth"
    aria-live="polite"
    as="p"
    autoSize={false}
    className={cn(
      'flex min-w-0 shrink-0 flex-wrap font-medium font-sans',
      className,
    )}
    initial
    trend={1}
  >
    {label}
  </Calligraph>
)

export const WeaveRegistration = ({
  name,
  progress,
  description,
  animate = true,
  footer,
  weaveOptions = JACQUARD_PATTERN6_DYE_BLEED_OPTIONS,
}: WeaveRegistrationProps) => {
  const { i18n } = useLingui()
  const p = Math.max(0, Math.min(1, progress / 100))
  const stepMessage = stepMessageForProgress(p)
  const stepLabel = stepMessage ? i18n._(stepMessage) : ''
  const [nameLineCount, setNameLineCount] = useState(1)
  const nameFillTypography = weaveRegistrationNameFillFor(name)
  const singleLineName = nameLineCount <= 1

  const reducedMotion = usePrefersReducedMotion()
  const resolvedWeaveOptions = reducedMotion
    ? { ...weaveOptions, shimmer: false, animated: false }
    : weaveOptions
  const nameAnimate = animate && !reducedMotion

  return (
    <div className="flex w-full flex-col items-center gap-8">
      <div className="inline-flex min-h-40 w-full items-stretch gap-12 max-md:flex-col max-md:items-center max-md:gap-3 max-md:text-center">
        <div className="w-full md:hidden">
          <WeaveRegistrationStepLabel
            className="mx-auto w-[225px] max-w-full justify-start text-left text-[#3e3e3e] text-base leading-[90%] tracking-[-0.4px]"
            label={stepLabel}
          />
        </div>

        <div className="size-40 shrink-0 overflow-hidden rounded-2xl max-md:size-[225px]">
          <WeaveCanvas options={resolvedWeaveOptions} />
        </div>

        <div className="flex h-full min-h-40 w-[333px] min-w-0 flex-col max-md:w-full">
          <div className="hidden md:block">
            <WeaveRegistrationStepLabel
              className="w-full text-[32px] text-ens-quartz-450 leading-[90%] tracking-[-0.8px]"
              label={stepLabel}
            />
          </div>
          <div
            aria-hidden
            className={cn(
              'shrink-0 max-md:hidden',
              singleLineName ? 'flex-1' : 'flex-none',
            )}
            style={{ minHeight: WEAVE_REGISTRATION_HEADLINE_NAME_GAP_MIN_PX }}
          />
          <NameFill
            animate={nameAnimate}
            className="mt-[18px] w-full shrink-0 whitespace-normal break-all max-md:mt-3 max-md:text-center"
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
