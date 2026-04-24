import { useId, useMemo } from 'react'

import { tw } from '@/utils/tailwind'

/** DJB2 XOR hash → 2 bytes (theme + 16 payload bits). */
function getBytesFromName(name: string): Uint8Array {
  let h1 = 5381
  let h2 = 52711
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i)
    h1 = (h1 * 33) ^ c
    h2 = (h2 * 37) ^ c
  }
  const bytes = new Uint8Array(2)
  for (let i = 0; i < 2; i++) {
    bytes[i] = Math.abs((h1 ^ (h2 >> i) ^ (i * 0x5bd1e995)) % 256)
  }
  return bytes
}

/** ENS official palettes (surface → core). */
const ensThemes = [
  { start: '#79b1d0', end: '#0080bc' }, // Lapis
  { start: '#f886b6', end: '#f53293' }, // Garnet
  { start: '#74ac76', end: '#007c23' }, // Peridot
  { start: '#984D1B', end: '#E1B77E' }, // Citrine,
  { start: '#191919', end: '#595755' }, // Black
] as const

function generateColors(bytes: Uint8Array): [string, string] {
  const themeIndex = (bytes[0] ?? 0) % ensThemes.length
  const theme = ensThemes[themeIndex] ?? ensThemes[0]
  return [theme.start, theme.end]
}

export type PatternAvatarProps = {
  readonly name: string
  readonly className?: string
}

/**
 * Deterministic 6×6 data-matrix-style grid; inner 4×4 from name bytes.
 */
export const PatternAvatar = ({ name, className }: PatternAvatarProps) => {
  const reactId = useId().replaceAll(':', '')
  const gradientId = `pattern-grad-${reactId}`

  const { colors, cells } = useMemo(() => {
    const bytes = getBytesFromName(name)
    const colors = generateColors(bytes)
    const grid: { x: number; y: number }[] = []
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 6; x++) {
        let isFilled = false
        if (x === 0 || y === 5) {
          isFilled = true
        } else if (y === 0) {
          isFilled = x % 2 === 0
        } else if (x === 5) {
          isFilled = (5 - y) % 2 === 0
        } else {
          const dataIndex = (y - 1) * 4 + (x - 1)
          const bytePos = Math.floor(dataIndex / 8)
          const bitPos = dataIndex % 8
          isFilled = ((bytes[bytePos] ?? 0) & (1 << bitPos)) !== 0
        }
        if (isFilled) {
          grid.push({ x: 1 + x * 2, y: 1 + y * 2 })
        }
      }
    }
    return { colors, cells: grid }
  }, [name])

  return (
    <div
      className={tw(
        'flex h-full w-full items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-100 p-1 shadow-inner',
        className,
      )}
    >
      <svg
        aria-label={`${name} pattern`}
        className="h-full w-full"
        role="img"
        viewBox="0 0 14 14"
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" x2="100%" y1="0%" y2="100%">
            <stop offset="0%" stopColor={colors[0]} />
            <stop offset="100%" stopColor={colors[1]} />
          </linearGradient>
        </defs>
        {cells.map((cell, i) => (
          <rect
            fill={`url(#${gradientId})`}
            height={2}
            key={`${cell.x}-${cell.y}-${i}`}
            rx={0}
            width={2}
            x={cell.x}
            y={cell.y}
          />
        ))}
      </svg>
    </div>
  )
}
