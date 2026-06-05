'use client'

/**
 * NameFill — like WeaveName, but the glyphs fill with a plain defined colour (or any CSS
 * `background`, e.g. a gradient) instead of the woven shader. As `progress` (0–1) advances,
 * the fill sweeps left→right over a light-grey base ("light grey on the name, then it fills
 * with a darker colour").
 *
 * Same mechanic as WeaveName: the name is drawn as an SVG glyph shape used as a CSS mask, so
 * the fill only shows inside the letters; a `clip-path` inset reveals it left→right.
 */
import { useLayoutEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  FALLBACK_FONT,
  measureName,
  nameSvgDataUri,
  type TextMetricsBox,
} from './nameMask'

export interface NameFillProps {
  /** The name to render and reveal, e.g. "erni.eth". */
  name: string
  /** Reveal progress, 0–1. The fill sweeps left→right to this fraction. */
  progress?: number
  /** The fill — any CSS color or `background` value (e.g. a gradient). Defaults to ENS blue. */
  fill?: string
  /** Colour of the not-yet-filled (base) name. */
  baseColor?: string
  /** Font size in px for the name. */
  fontSize?: number
  fontFamily?: string
  fontWeight?: number | string
  /** Animate progress changes with a CSS transition. Disable for reduced motion / scrubbing. */
  animate?: boolean
  className?: string
}

export function NameFill({
  name,
  progress = 1,
  fill = '#0080bc',
  baseColor = 'rgba(0,0,0,0.12)',
  fontSize = 64,
  fontFamily = FALLBACK_FONT,
  fontWeight = 700,
  animate = true,
  className,
}: NameFillProps) {
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

  // Horizontal reveal via clip-path inset (transitions smoothly).
  const insetRight = (1 - p) * 100

  return (
    <span
      className={cn('relative inline-block align-bottom', className)}
      style={{ width: width || undefined, height: height || undefined }}
    >
      {/* Hidden text kept for accessibility / selection / fallback. */}
      <span className="sr-only">{name}</span>

      {/* Base (not-yet-filled) name. */}
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

      {/* Fill: masked to glyphs, then clipped left→right by progress. */}
      {glyphMaskUri ? (
        <span
          aria-hidden
          className="absolute inset-0"
          style={{
            background: fill,
            WebkitMaskImage: glyphMaskUri,
            maskImage: glyphMaskUri,
            WebkitMaskRepeat: 'no-repeat',
            maskRepeat: 'no-repeat',
            WebkitMaskSize: '100% 100%',
            maskSize: '100% 100%',
            clipPath: `inset(0 ${insetRight}% 0 0)`,
            transition: animate ? 'clip-path 0.45s ease' : 'none',
          }}
        />
      ) : null}
    </span>
  )
}
