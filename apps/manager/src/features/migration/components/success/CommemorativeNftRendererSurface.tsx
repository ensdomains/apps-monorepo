import { useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import type { CommemorativeNftEligibility } from '../../commemorative-nft/types'

type CommemorativeNftRendererSurfaceProps = {
  readonly artworkUrl?: string
  readonly eligibility: CommemorativeNftEligibility
  readonly onReady?: () => void
  readonly rendererUrl?: string
}

export const CommemorativeNftRendererSurface = ({
  artworkUrl,
  eligibility,
  onReady,
  rendererUrl,
}: CommemorativeNftRendererSurfaceProps) => {
  const shouldReduceMotion = useReducedMotion()
  const [artworkFailed, setArtworkFailed] = useState(false)
  const [rendererFailed, setRendererFailed] = useState(false)
  const [rendererReady, setRendererReady] = useState(false)

  useEffect(() => {
    if (!rendererUrl && !artworkUrl) onReady?.()
  }, [artworkUrl, onReady, rendererUrl])

  const fallback =
    artworkUrl && !artworkFailed ? (
      <img
        alt=""
        className="pointer-events-none absolute top-0 left-[-7.03%] h-full w-[141.41%] max-w-none select-none object-cover"
        draggable={false}
        onError={() => {
          setArtworkFailed(true)
          if (!rendererUrl) onReady?.()
        }}
        onLoad={() => {
          if (!rendererUrl) onReady?.()
        }}
        src={artworkUrl}
      />
    ) : (
      <div
        aria-label={`Loading commemorative NFT preview for ${eligibility.rendererName}`}
        aria-live="polite"
        className="absolute inset-0 overflow-hidden rounded-[18px] bg-[#f1d5e1]"
        data-archetype={eligibility.traits.Archetype}
        data-seed={eligibility.traits.Seed}
        role="status"
      >
        <div className="absolute inset-0 bg-linear-to-br from-white/50 via-[#f6dce7] to-[#eec7d8]" />
        {shouldReduceMotion ? null : (
          <div className="pointer-events-none absolute inset-0 animate-shimmer bg-linear-to-r from-transparent via-white/70 to-transparent" />
        )}
      </div>
    )

  return (
    <>
      {rendererReady && !rendererFailed ? null : fallback}
      {rendererUrl && !rendererFailed ? (
        <iframe
          className={`absolute top-1/2 left-1/2 h-full w-[109%] -translate-x-1/2 -translate-y-1/2 scale-[1.15] border-0 ${
            rendererReady ? 'opacity-100' : 'opacity-0'
          }`}
          onError={() => {
            setRendererFailed(true)
            onReady?.()
          }}
          onLoad={() => {
            setRendererReady(true)
            onReady?.()
          }}
          referrerPolicy="no-referrer"
          sandbox="allow-same-origin allow-scripts"
          src={rendererUrl}
          tabIndex={-1}
          title={`Interactive commemorative NFT artwork for ${eligibility.rendererName}`}
        />
      ) : null}
    </>
  )
}
