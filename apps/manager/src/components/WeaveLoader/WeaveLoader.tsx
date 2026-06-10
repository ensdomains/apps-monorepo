'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { WeaveShaderOptions } from './shader/useWeaveShader'
import { WeaveName } from './WeaveName'
import { stepLabelForProgress, WEAVE_STEPS, type WeaveStep } from './weaveSteps'

export interface WeaveLoaderProps {
  name: string
  progress: number
  stepLabel?: string
  steps?: WeaveStep[]
  hideStep?: boolean
  animate?: boolean
  weaveOptions?: WeaveShaderOptions
  fontSize?: number
  className?: string
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

export function WeaveLoader({
  name,
  progress,
  stepLabel,
  steps = WEAVE_STEPS,
  hideStep = false,
  animate,
  weaveOptions,
  fontSize = 72,
  className,
}: WeaveLoaderProps) {
  const reducedMotion = usePrefersReducedMotion()
  const shouldAnimate = animate ?? !reducedMotion
  const label = stepLabel ?? stepLabelForProgress(progress, steps)

  return (
    <div
      className={cn('flex flex-col items-center gap-6 text-center', className)}
    >
      <WeaveName
        animate={shouldAnimate}
        fontSize={fontSize}
        name={name}
        progress={progress}
        weaveOptions={weaveOptions}
      />
      {hideStep ? null : (
        <p
          aria-live="polite"
          className="max-w-sm text-balance font-medium text-base text-muted-foreground transition-opacity duration-300"
          key={label}
        >
          {label}
        </p>
      )}
    </div>
  )
}
