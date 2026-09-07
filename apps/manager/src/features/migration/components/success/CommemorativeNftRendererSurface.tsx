import { Trans } from '@lingui/react/macro'
import { useReducedMotion } from 'motion/react'
import { tw } from '@/utils/tailwind'
import { getCommemorativeNftConfig } from '../../commemorative-nft/config'
import type { CommemorativeNftEligibility } from '../../commemorative-nft/types'
import { getRendererSandbox } from './rendererSandbox'
import { useCommemorativeNftRenderer } from './useCommemorativeNftRenderer'

type CommemorativeNftRendererSurfaceProps = {
  readonly artworkUrl?: string
  readonly eligibility: CommemorativeNftEligibility
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
  const shouldReduceMotion = useReducedMotion()
  const source = useCommemorativeNftRenderer(props)
  const showRenderer =
    source.rendererStatus === 'ready' &&
    !(shouldReduceMotion && source.imageStatus === 'ready')

  return (
    <>
      <div
        className={tw(
          'absolute inset-0 z-10 overflow-hidden rounded-[inherit]',
          showRenderer ? 'pointer-events-none opacity-0' : 'opacity-100',
        )}
      >
        {props.artworkUrl && source.imageStatus !== 'failed' ? (
          <img
            alt=""
            className="pointer-events-none absolute top-0 left-[-7.03%] h-full w-[141.41%] max-w-none select-none object-cover"
            draggable={false}
            onError={source.onImageError}
            onLoad={source.onImageLoad}
            src={props.artworkUrl}
          />
        ) : (
          <ArtworkPlaceholder
            failed={source.failed}
            showError={!props.onError}
          />
        )}
      </div>
      {props.rendererUrl && source.rendererStatus !== 'failed' ? (
        <iframe
          className={tw(
            'absolute top-1/2 left-1/2 z-0 h-full w-[109%] -translate-x-1/2 -translate-y-1/2 scale-[1.15] border-0',
            showRenderer ? 'opacity-100' : 'pointer-events-none opacity-0',
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
          title={`Interactive commemorative NFT artwork for ${props.eligibility.rendererName}`}
        />
      ) : null}
    </>
  )
}

export const CommemorativeNftRendererSurface = (
  props: CommemorativeNftRendererSurfaceProps,
) => (
  <RendererSurface
    {...props}
    key={`${props.rendererUrl ?? ''}:${props.artworkUrl ?? ''}`}
  />
)
