import { Trans } from '@lingui/react/macro'
import { useReducedMotion } from 'motion/react'
import { useState } from 'react'
import { tw } from '@/utils/tailwind'
import { getCommemorativeNftConfig } from '../../commemorative-nft/config'
import type { CommemorativeNftEligibility } from '../../commemorative-nft/types'
import { getRendererSandbox } from './rendererSandbox'
import { useCommemorativeNftRenderer } from './useCommemorativeNftRenderer'

type CommemorativeNftRendererSurfaceProps = {
  readonly eligibility: CommemorativeNftEligibility
  readonly interactive?: boolean
  readonly onReady?: () => void
  readonly onError?: () => void
  readonly rendererUrl?: string
}

const isRendererDocumentLoad = (iframe: HTMLIFrameElement) => {
  try {
    return iframe.contentWindow?.location.href !== 'about:blank'
  } catch {
    // Cross-origin renderer documents cannot expose their location to the app.
    return true
  }
}

const ArtworkPlaceholder = ({
  failed,
  showError,
}: {
  readonly failed: boolean
  readonly showError: boolean
}) => (
  <div
    aria-live="polite"
    className="absolute inset-0 flex items-center justify-center bg-ens-garnet-100 p-4 text-center text-ens-garnet-900 text-xs"
    role="status"
  >
    {failed ? (
      showError ? (
        <Trans>Artwork could not be loaded.</Trans>
      ) : null
    ) : (
      <span className="sr-only">
        <Trans>Loading NFT artwork…</Trans>
      </span>
    )}
  </div>
)

const RendererSurface = (props: CommemorativeNftRendererSurfaceProps) => {
  const interactive = props.interactive !== false
  const source = useCommemorativeNftRenderer(props)
  const showRenderer = source.ready

  return (
    <>
      {showRenderer ? null : (
        <ArtworkPlaceholder failed={source.failed} showError={!props.onError} />
      )}
      {props.rendererUrl && source.rendererStatus !== 'failed' ? (
        <iframe
          className={tw(
            'absolute top-1/2 left-1/2 z-0 h-full w-[109%] -translate-x-1/2 -translate-y-1/2 scale-[1.15] border-0',
            showRenderer ? 'opacity-100' : 'opacity-0',
            (!showRenderer || !interactive) && 'pointer-events-none',
          )}
          onError={source.onRendererError}
          onLoad={(event) => {
            if (isRendererDocumentLoad(event.currentTarget))
              source.onRendererLoad()
          }}
          referrerPolicy="no-referrer"
          sandbox={getRendererSandbox({
            rendererUrl: props.rendererUrl,
            appOrigin:
              typeof window === 'undefined'
                ? undefined
                : window.location.origin,
            trustedRendererOrigin: getCommemorativeNftConfig().rendererOrigin,
          })}
          src={props.rendererUrl}
          tabIndex={-1}
          title={`${interactive ? 'Interactive commemorative' : 'Commemorative'} NFT artwork for ${props.eligibility.rendererName}`}
        />
      ) : null}
    </>
  )
}

export const CommemorativeNftRendererSurface = (
  props: CommemorativeNftRendererSurfaceProps,
) => {
  const shouldReduceMotion = useReducedMotion()
  const [playArtwork, setPlayArtwork] = useState(false)

  // The external renderer cannot pause, so reduced-motion users opt in to it.
  if (shouldReduceMotion && !playArtwork) {
    return (
      <div className="absolute inset-0 flex items-center justify-center rounded-[inherit] bg-ens-garnet-100 p-4">
        <button
          className="min-h-11 rounded-lg border border-ens-garnet-900 px-4 py-2 text-ens-garnet-900 text-sm focus-visible:outline-2 focus-visible:outline-ens-garnet-900 focus-visible:outline-offset-2"
          onClick={() => setPlayArtwork(true)}
          type="button"
        >
          <Trans>Play artwork</Trans>
        </button>
      </div>
    )
  }

  return <RendererSurface {...props} key={props.rendererUrl} />
}
