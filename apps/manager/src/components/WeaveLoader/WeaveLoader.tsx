'use client'

/**
 * WeaveLoader — registration "ephemeral" loader: the name being registered fills out with
 * the woven jacquard fabric as `progress` advances, while a playful step label tracks the
 * backend stage. POC is fully prop-driven (no xstate wiring yet) — drive `progress` (0–1)
 * and optionally override the step label.
 *
 * Honors prefers-reduced-motion: when set, the fill snaps instead of animating.
 */
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { WeaveShaderOptions } from './shader/useWeaveShader'
import { WeaveName } from './WeaveName'
import { stepLabelForProgress, WEAVE_STEPS, type WeaveStep } from './weaveSteps'

export interface WeaveLoaderProps {
  /** The ENS name being registered, e.g. "erni.eth". */
  name: string
  /** Reveal progress, 0–1. Drives both the woven fill and the default step label. */
  progress: number
  /** Override the step label (otherwise derived from progress + steps). */
  stepLabel?: string
  /** Custom step list (defaults to the ENS ephemeral steps). */
  steps?: WeaveStep[]
  /** Hide the step label (show the filling name only). */
  hideStep?: boolean
  /** Force-disable the fill animation (otherwise auto-disabled under reduced motion). */
  animate?: boolean
  /** Weave fabric options passed through to the shader. */
  weaveOptions?: WeaveShaderOptions
  /** Font size in px for the name. */
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
          // key forces a re-mount so the transition runs on label change
          key={label}
        >
          {label}
        </p>
      )}
    </div>
  )
}
