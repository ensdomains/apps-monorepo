/**
 * WeaveRegistration — the "registration in progress" loader shown after the notifications
 * step is dismissed. Matches the Figma mock: a woven houndstooth-shimmer square on the left,
 * with the registering name filling out (grey → dark) on the right as the transaction
 * progresses, and a playful step label that changes with progress. When registration
 * completes the name is fully filled.
 */
import {
  HOUNDSTOOTH_SHIMMER_OPTIONS,
  NameFill,
  stepLabelForProgress,
  WeaveCanvas,
} from '@/components/WeaveLoader'

const NAME_FONT =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace'

export interface WeaveRegistrationProps {
  /** Full ENS name being registered, e.g. "erni.eth". */
  name: string
  /** Registration progress on a 0–100 scale (from the UI machine). */
  progress: number
  /** Optional secondary line (e.g. commitment cooldown countdown). */
  description?: string
}

export const WeaveRegistration = ({
  name,
  progress,
  description,
}: WeaveRegistrationProps) => {
  const p = Math.max(0, Math.min(1, progress / 100))
  const stepLabel = stepLabelForProgress(p)

  return (
    <div className="flex flex-col items-center gap-6 px-3 py-8 max-md:text-center md:flex-row md:items-center md:gap-10 md:py-12">
      <div className="size-32 shrink-0 overflow-hidden rounded-2xl md:size-40">
        <WeaveCanvas options={HOUNDSTOOTH_SHIMMER_OPTIONS} />
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <p
          aria-live="polite"
          className="max-w-sm text-balance font-medium text-ens-blue text-xl md:text-2xl"
          key={stepLabel}
        >
          {stepLabel}
        </p>

        <NameFill
          baseColor="var(--color-ens-gray-two)"
          fill="var(--color-foreground)"
          fontFamily={NAME_FONT}
          fontSize={56}
          fontWeight={500}
          name={name}
          progress={p}
        />

        {description ? (
          <p className="text-ens-gray text-sm">{description}</p>
        ) : null}
      </div>
    </div>
  )
}
