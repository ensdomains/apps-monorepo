import type { CSSProperties } from 'react'

export interface FilledGlyphProps {
  char: string
  advanceWidth: number
  glyphHeight: number
  /** 0 = unfilled, 1 = fully filled */
  fraction: number
  fill: string
  baseColor: string
  animate?: boolean
  gradient?: boolean
}

/**
 * One glyph with independent fill — grey base + fill layer clipped horizontally
 * only (clip-path), so descenders (g, y, p) are never vertically truncated.
 */
export function FilledGlyph({
  char,
  advanceWidth,
  glyphHeight,
  fraction,
  fill,
  baseColor,
  animate = true,
  gradient = false,
}: FilledGlyphProps) {
  const insetRight = (1 - fraction) * 100

  const fillStyle: CSSProperties = gradient
    ? {
        background: fill,
        backgroundClip: 'text',
        WebkitBackgroundClip: 'text',
        color: 'transparent',
        WebkitTextFillColor: 'transparent',
      }
    : { color: fill }

  return (
    <span
      aria-hidden
      className="relative inline-block overflow-visible align-bottom"
      style={{
        width: advanceWidth,
        minHeight: glyphHeight > 0 ? glyphHeight : undefined,
        verticalAlign: 'bottom',
      }}
    >
      <span style={{ color: baseColor }}>{char}</span>
      {fraction > 0 ? (
        <span
          className="pointer-events-none absolute inset-0 overflow-visible"
          style={{
            clipPath: `inset(0 ${insetRight}% 0 0)`,
            WebkitClipPath: `inset(0 ${insetRight}% 0 0)`,
            transition: animate ? 'clip-path 0.45s ease' : 'none',
          }}
        >
          <span
            style={{
              ...fillStyle,
              display: 'inline-block',
              width: advanceWidth,
            }}
          >
            {char}
          </span>
        </span>
      ) : null}
    </span>
  )
}
