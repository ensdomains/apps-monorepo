import { generatePatternDataURI } from '@ensdomains/etherloom'
import { useId, useMemo } from 'react'

export type DomainCardVariant = 'garnet' | 'lapis' | 'peridot'

const patternColors = {
  garnet: {
    background: 'var(--color-ens-garnet-100)',
    tiles: 'var(--color-ens-garnet-500)',
    shimmer: '#FF81ED',
    highlight: '#FFD8FF',
  },
  lapis: {
    background: 'var(--color-ens-lapis-100)',
    tiles: 'var(--color-ens-lapis-500)',
    shimmer: 'var(--color-ens-lapis-300)',
    highlight: 'var(--color-ens-lapis-100)',
  },
  peridot: {
    background: 'var(--color-ens-peridot-100)',
    tiles: 'var(--color-ens-peridot-500)',
    shimmer: 'var(--color-ens-peridot-300)',
    highlight: 'var(--color-ens-peridot-100)',
  },
} as const

export const DomainCardPattern = ({
  domainName,
  variant,
}: {
  readonly domainName: string
  readonly variant: DomainCardVariant
}) => {
  const id = useId()
  const maskId = `${id}-tiles`
  const glintId = `${id}-glint`
  const colors = patternColors[variant]
  const patternSrc = useMemo(
    () =>
      generatePatternDataURI(domainName, 'ENS Vertical Pairs', '#FEFEFE', {
        width: 440,
        height: 200,
        cellSize: 10,
        backgroundColor: '#000000',
      }),
    [domainName],
  )

  return (
    <svg
      aria-hidden="true"
      className="aspect-[11/5] h-auto w-full overflow-hidden rounded"
      fill="none"
      focusable="false"
      height="200"
      viewBox="0 0 440 200"
      width="440"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <mask
          height="200"
          id={maskId}
          maskUnits="userSpaceOnUse"
          style={{ maskType: 'luminance' }}
          width="440"
          x="0"
          y="0"
        >
          {/* Near-white preserves Etherloom's tile breaks while masking the color and wave. */}
          <image height="200" href={patternSrc} width="440" />
        </mask>
        {/* Equal SVG coordinate spans preserve the 45-degree band. */}
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id={glintId}
          x1="-50"
          x2="50"
          y1="-50"
          y2="50"
        >
          <stop stopColor={colors.shimmer} stopOpacity="0" />
          <stop offset="0.25" stopColor={colors.shimmer} stopOpacity="0.15" />
          <stop offset="0.5" stopColor={colors.highlight} stopOpacity="0.85" />
          <stop offset="0.75" stopColor={colors.shimmer} stopOpacity="0.15" />
          <stop offset="1" stopColor={colors.shimmer} stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect fill={colors.background} height="200" rx="4" width="440" />
      <g mask={`url(#${maskId})`}>
        <rect fill={colors.tiles} height="200" width="440" />
        <rect
          className="animate-domain-card-shimmer"
          fill={`url(#${glintId})`}
          height="1280"
          width="1280"
          x="-640"
          y="-640"
        />
      </g>
    </svg>
  )
}
