import { useEffect, useState } from 'react'
import { MSymbol } from '@/components/ui/material-symbol'
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
        aria-label={`Commemorative NFT preview for ${eligibility.rendererName}`}
        className="absolute inset-0 flex items-center justify-center overflow-hidden bg-[#f8dce7] px-6 text-center"
        data-archetype={eligibility.traits.Archetype}
        data-seed={eligibility.traits.Seed}
        role="img"
      >
        <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,transparent_0,transparent_11px,rgba(128,0,54,0.045)_11px,rgba(128,0,54,0.045)_12px)]" />
        <div className="absolute inset-3 rounded-[13px] border border-ens-garnet-500/15 border-dashed" />
        <div className="relative text-ens-garnet-500">
          <span className="flex size-9 items-center justify-center rounded-full bg-white/55">
            <MSymbol className="text-[20px]" symbol="image" />
          </span>
        </div>
      </div>
    )

  return (
    <>
      {fallback}
      {rendererUrl && !rendererFailed ? (
        <iframe
          className={`absolute top-1/2 left-1/2 h-full w-[109%] -translate-x-1/2 -translate-y-1/2 scale-[1.15] border-0 transition-opacity duration-500 ${
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
