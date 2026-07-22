import { Trans } from '@lingui/react/macro'
import { useEffect, useState } from 'react'
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
        aria-label={`NFT preview unavailable for ${eligibility.rendererName}`}
        className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_45%_35%,#58c8ff_0%,#a946c4_36%,#082d74_100%)] px-6 text-center"
        data-archetype={eligibility.traits.Archetype}
        data-seed={eligibility.traits.Seed}
        role="img"
      >
        <span className="font-semi-mono text-[7px] text-white/80 uppercase tracking-[0.18em]">
          <Trans>Preview unavailable</Trans>
        </span>
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
