import { useEffect, useState } from 'react'
import { MSymbol } from '@/components/ui/material-symbol'
import type { CommemorativeNftEligibility } from '../../commemorative-nft/types'

type CommemorativeNftRendererSurfaceProps = {
  readonly artworkUrl?: string
  readonly eligibility: CommemorativeNftEligibility
  readonly onReady?: () => void
}

/**
 * Stable seam for WEB-604's browser-only renderer export. Until that package is
 * consumable by Manager, this surface renders the persistent PNG (or a clear
 * failure treatment) and never attempts to import the document-touching entry.
 */
export const CommemorativeNftRendererSurface = ({
  artworkUrl,
  eligibility,
  onReady,
}: CommemorativeNftRendererSurfaceProps) => {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
    if (!artworkUrl) onReady?.()
  }, [artworkUrl, onReady])

  if (!artworkUrl || failed) {
    return (
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
  }

  return (
    <img
      alt=""
      className="pointer-events-none absolute top-0 left-[-7.03%] h-full w-[141.41%] max-w-none select-none object-cover"
      draggable={false}
      onError={() => {
        setFailed(true)
        onReady?.()
      }}
      onLoad={onReady}
      src={artworkUrl}
    />
  )
}
