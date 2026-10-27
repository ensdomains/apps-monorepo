import { cn } from './lib/utils'
import { WEAVE_PROGRESS_BAR_OPTIONS } from './presets'
import type { WeaveShaderOptions } from './shader/useWeaveShader'
import { WeaveCanvas } from './WeaveCanvas'

export const WEAVE_PROGRESS_BAR_HEIGHT = 19
export const WEAVE_PROGRESS_BAR_RADIUS = 2

export interface WeaveProgressBarProps {
  readonly progress: number
  readonly options?: WeaveShaderOptions
  readonly height?: number
  /** Animate the fill as progress changes (weave pattern is static). */
  readonly animate?: boolean
  readonly className?: string
}

export function WeaveProgressBar({
  progress,
  options = WEAVE_PROGRESS_BAR_OPTIONS,
  height = WEAVE_PROGRESS_BAR_HEIGHT,
  animate = true,
  className,
}: WeaveProgressBarProps) {
  const p = Math.max(0, Math.min(1, progress))

  return (
    <div
      className={cn(
        'relative w-full overflow-hidden bg-ens-gray-two',
        className,
      )}
      style={{
        height,
        borderRadius: WEAVE_PROGRESS_BAR_RADIUS,
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          clipPath: `inset(0 ${(1 - p) * 100}% 0 0)`,
          transition: animate ? 'clip-path 0.5s ease-out' : 'none',
        }}
      >
        <WeaveCanvas className="h-full w-full" options={options} />
      </div>
    </div>
  )
}
