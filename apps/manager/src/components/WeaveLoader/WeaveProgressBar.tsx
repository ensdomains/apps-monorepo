'use client'

import { cn } from '@/lib/utils'
import { HOUNDSTOOTH_SHIMMER_OPTIONS } from './presets'
import type { WeaveShaderOptions } from './shader/useWeaveShader'
import { WeaveCanvas } from './WeaveCanvas'

export interface WeaveProgressBarProps {
  progress: number
  options?: WeaveShaderOptions
  height?: number
  animate?: boolean
  className?: string
}

export function WeaveProgressBar({
  progress,
  options = HOUNDSTOOTH_SHIMMER_OPTIONS,
  height = 12,
  animate = true,
  className,
}: WeaveProgressBarProps) {
  const p = Math.max(0, Math.min(1, progress))
  const insetRight = (1 - p) * 100

  return (
    <div
      className={cn(
        'relative w-full overflow-hidden rounded-full bg-ens-gray-two',
        className,
      )}
      style={{ height }}
    >
      <div
        className="absolute inset-0"
        style={{
          clipPath: `inset(0 ${insetRight}% 0 0)`,
          transition: animate ? 'clip-path 0.5s ease-out' : 'none',
        }}
      >
        <WeaveCanvas className="h-full w-full" options={options} />
      </div>
    </div>
  )
}
