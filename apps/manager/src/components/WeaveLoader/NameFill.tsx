'use client'

import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'

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
}: NameFillProps) {
  const p = Math.max(0, Math.min(1, progress))
  const insetRight = (1 - p) * 100

  const typography: CSSProperties = {
    fontFamily,
    fontSize,
    fontWeight,
    letterSpacing,
    lineHeight,
  }

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
