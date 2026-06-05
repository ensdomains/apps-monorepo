'use client'

/**
 * WeaveName — renders an ENS name whose glyphs "fill out" with the woven fabric as
 * `progress` (0–1) advances left→right, over a light-grey base. Matches the registration
 * prototype ("light grey on the name and then it fills with a darker colour").
 *
 * How it works: the name is drawn as an SVG glyph shape. A light-grey copy is the base
 * layer. On top, a WeaveCanvas is masked by (a) the same glyph SVG and (b) a horizontal
 * progress gradient, composited with intersect — so the weave only shows inside letters,
 * up to the current progress. Geometry is shared between base + mask so they align exactly.
 */
import { useLayoutEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  FALLBACK_FONT,
  measureName,
  nameSvgDataUri,
  type TextMetricsBox,
} from './nameMask'
import type { WeaveShaderOptions } from './shader/useWeaveShader'
import { WeaveCanvas } from './WeaveCanvas'

export interface WeaveNameProps {
  /** The name to render and reveal, e.g. "erni.eth". */
  name: string
  /** Reveal progress, 0–1. The woven fill sweeps left→right to this fraction. */
  progress?: number
  /** Font size in px for the name. */
  fontSize?: number
  fontFamily?: string
  fontWeight?: number | string
  /** Colour of the not-yet-woven (base) name. */
  baseColor?: string
  /** Animate progress changes with a CSS transition. Disable for reduced motion / scrubbing. */
  animate?: boolean
  /** Weave fabric options passed through to WeaveCanvas. */
  weaveOptions?: WeaveShaderOptions
  className?: string
}

export function WeaveName({
  name,
  progress = 1,
  fontSize = 64,
  fontFamily = FALLBACK_FONT,
  fontWeight = 700,
  baseColor = 'rgba(0,0,0,0.12)',
  animate = true,
  weaveOptions,
  className,
}: WeaveNameProps) {
  const [box, setBox] = useState<TextMetricsBox>({
    width: 0,
    height: 0,
    baseline: 0,
  })

  // Re-measure when the text or typography changes.
  useLayoutEffect(() => {
    setBox(measureName(name, fontSize, fontFamily, fontWeight))
  }, [name, fontSize, fontFamily, fontWeight])

  const p = Math.max(0, Math.min(1, progress))
  const { width, height } = box

  const baseUri =
    width > 0
      ? nameSvgDataUri({
          name,
          box,
          fontSize,
          fontFamily,
          fontWeight,
          fill: '#000',
        })
      : ''
  const glyphMaskUri =
    width > 0
      ? nameSvgDataUri({
          name,
          box,
          fontSize,
          fontFamily,
          fontWeight,
          fill: '#fff',
        })
      : ''

  // Horizontal reveal via clip-path inset (transitions smoothly, unlike gradient stops).
  const insetRight = (1 - p) * 100

  return (
    <span
      className={cn('relative inline-block align-bottom', className)}
      style={{ width: width || undefined, height: height || undefined }}
    >
      {/* Hidden text kept for accessibility / selection / fallback. */}
      <span className="sr-only">{name}</span>

      {/* Base (not-yet-woven) name. */}
      {baseUri ? (
        <span
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundColor: baseColor,
            WebkitMaskImage: baseUri,
            maskImage: baseUri,
            WebkitMaskRepeat: 'no-repeat',
            maskRepeat: 'no-repeat',
            WebkitMaskSize: '100% 100%',
            maskSize: '100% 100%',
          }}
        />
      ) : null}

      {/* Woven fill: masked to glyphs, then clipped left→right by progress. */}
      {glyphMaskUri ? (
        <span
          aria-hidden
          className="absolute inset-0"
          style={{
            WebkitMaskImage: glyphMaskUri,
            maskImage: glyphMaskUri,
            WebkitMaskRepeat: 'no-repeat',
            maskRepeat: 'no-repeat',
            WebkitMaskSize: '100% 100%',
            maskSize: '100% 100%',
            clipPath: `inset(0 ${insetRight}% 0 0)`,
            transition: animate ? 'clip-path 0.45s ease' : 'none',
          }}
        >
          <WeaveCanvas className="h-full w-full" options={weaveOptions} />
        </span>
      ) : null}
    </span>
  )
}
