import {
  type CSSProperties,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { FilledGlyph } from './FilledGlyph'
import { cn } from './lib/utils'
import {
  charFillFraction,
  type GlyphMetrics,
  lineCountFromMetrics,
  measureGlyphMetrics,
  segmentGraphemes,
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
  onFillSettled?: () => void
}

function isGradientFill(fill: string): boolean {
  return /gradient\s*\(/i.test(fill)
}

const FILL_CLIP_TRANSITION_MS = 450

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
  onFillSettled,
}: NameFillProps) {
  const p = Math.max(0, Math.min(1, progress))
  const chars = useMemo(() => segmentGraphemes(name), [name])
  const fillPosition = p * chars.length
  const gradient = isGradientFill(fill)
  const wraps = className?.includes('break-all') ?? false
  const fillSettledRef = useRef(false)
  const onFillSettledRef = useRef(onFillSettled)
  onFillSettledRef.current = onFillSettled

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

    const next = measureGlyphMetrics(probe, textNode, chars)
    setMetrics(next)
    onLineCountChangeRef.current?.(lineCountFromMetrics(next))
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: remeasure reads the live DOM, so re-run whenever name or any typography value changes the rendered glyphs (the w-full container's ResizeObserver does not fire on font-only changes).
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
  }, [
    name,
    fontSize,
    fontFamily,
    fontWeight,
    letterSpacing,
    lineHeight,
    className,
  ])

  const layoutReady = metrics.length === chars.length

  useEffect(() => {
    if (gradient && !wraps) return undefined
    if (!layoutReady || p < 1) {
      if (p < 1) fillSettledRef.current = false
      return undefined
    }
    if (fillSettledRef.current) return undefined

    const settle = () => {
      if (fillSettledRef.current) return
      fillSettledRef.current = true
      onFillSettledRef.current?.()
    }

    if (!animate) {
      settle()
      return undefined
    }

    const id = window.setTimeout(settle, FILL_CLIP_TRANSITION_MS)
    return () => window.clearTimeout(id)
  }, [animate, gradient, layoutReady, p, wraps])

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

  return (
    <span
      aria-label={name}
      className={cn(
        'relative inline-block w-full overflow-visible align-bottom',
        className,
      )}
      ref={containerRef}
      role="img"
      style={typography}
    >
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute top-0 left-0 w-full whitespace-normal break-all opacity-0',
          className,
        )}
        ref={probeRef}
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
              // biome-ignore lint/suspicious/noArrayIndexKey: chars is a fixed positional decomposition of name; glyphs never reorder, so index is the stable identity.
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
