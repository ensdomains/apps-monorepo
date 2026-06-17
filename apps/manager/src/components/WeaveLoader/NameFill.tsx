'use client'

import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { cn } from '@/lib/utils'
import { FilledGlyph } from './FilledGlyph'
import {
  charFillFraction,
  lineCountFromMetrics,
  measureGlyphMetrics,
  type GlyphMetrics,
} from './nameFillLayout'

export interface NameFillProps {
  name: string
  progress?: number
  fill?: string
  baseColor?: string
  fontSize?: number
  fontFamily?: string
  fontWeight?: number | string
  letterSpacing?: string
  lineHeight?: string | number
  animate?: boolean
  className?: string
  onLineCountChange?: (lineCount: number) => void
}

function isGradientFill(fill: string): boolean {
  return /gradient\s*\(/i.test(fill)
}

/** Single-line clip reveal — Storybook gradient demos only. */
function NameFillByClip({
  name,
  progress,
  fill,
  baseColor,
  typography,
  animate,
  className,
}: {
  name: string
  progress: number
  fill: string
  baseColor: string
  typography: CSSProperties
  animate: boolean
  className?: string
}) {
  const insetRight = (1 - progress) * 100

  return (
    <span
      className={cn('relative inline-block whitespace-nowrap', className)}
      style={typography}
    >
      <span style={{ color: baseColor }}>{name}</span>
      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          background: fill,
          backgroundClip: 'text',
          WebkitBackgroundClip: 'text',
          color: 'transparent',
          WebkitTextFillColor: 'transparent',
          clipPath: `inset(0 ${insetRight}% 0 0)`,
          transition: animate ? 'clip-path 0.45s ease' : 'none',
        }}
      >
        {name}
      </span>
    </span>
  )
}

export function NameFill({
  name,
  progress = 1,
  fill = '#000',
  baseColor = 'var(--color-ens-gray-two)',
  fontSize = 64,
  fontFamily = 'var(--font-mono)',
  fontWeight = 500,
  letterSpacing,
  lineHeight,
  animate = true,
  className,
  onLineCountChange,
}: NameFillProps) {
  const p = Math.max(0, Math.min(1, progress))
  const fillPosition = p * name.length
  const gradient = isGradientFill(fill)
  const wraps = className?.includes('break-all') ?? false

  const containerRef = useRef<HTMLSpanElement>(null)
  const probeRef = useRef<HTMLSpanElement>(null)
  const onLineCountChangeRef = useRef(onLineCountChange)
  onLineCountChangeRef.current = onLineCountChange
  const [metrics, setMetrics] = useState<GlyphMetrics[]>([])

  const typography: CSSProperties = {
    fontFamily,
    fontSize,
    fontWeight,
    letterSpacing,
    lineHeight,
  }

  const remeasure = () => {
    const probe = probeRef.current
    if (!probe) return

    const textNode = probe.firstChild
    if (!(textNode instanceof Text) || textNode.data !== name) return

    const next = measureGlyphMetrics(probe, textNode)
    setMetrics(next)
    onLineCountChangeRef.current?.(lineCountFromMetrics(next))
  }

  useLayoutEffect(() => {
    remeasure()

    const container = containerRef.current
    if (!container) return undefined

    const observer = new ResizeObserver(remeasure)
    observer.observe(container)

    if (document.fonts?.ready) {
      document.fonts.ready.then(remeasure)
    }

    return () => observer.disconnect()
  }, [name, fontSize, fontFamily, fontWeight, letterSpacing, lineHeight, className])

  if (gradient && !wraps) {
    return (
      <NameFillByClip
        animate={animate}
        baseColor={baseColor}
        className={className}
        fill={fill}
        name={name}
        progress={p}
        typography={typography}
      />
    )
  }

  const chars = Array.from(name)
  const layoutReady = metrics.length === chars.length

  return (
    <span
      ref={containerRef}
      aria-label={name}
      className={cn('relative inline-block w-full overflow-visible align-bottom', className)}
      style={typography}
    >
      <span
        ref={probeRef}
        aria-hidden
        className={cn(
          'pointer-events-none absolute top-0 left-0 w-full whitespace-normal break-all opacity-0',
          className,
        )}
        style={typography}
      >
        {name}
      </span>

      {layoutReady ? (
        chars.map((char, index) => {
          const glyph = metrics[index]
          if (!glyph) return null
          return (
            <FilledGlyph
              advanceWidth={glyph.advanceWidth}
              animate={animate}
              baseColor={baseColor}
              char={char}
              fill={fill}
              fraction={charFillFraction(fillPosition, index)}
              glyphHeight={glyph.glyphHeight}
              gradient={gradient}
              key={index}
            />
          )
        })
      ) : (
        <span style={{ color: baseColor }}>{name}</span>
      )}
    </span>
  )
}
