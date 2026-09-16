import { Trans } from '@lingui/react/macro'
import type { ReactNode } from 'react'
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
  readonly placeholder?: ReactNode
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

export const CommemorativeNftRendererSurface = (
  props: CommemorativeNftRendererSurfaceProps,
) => {
  const interactive = props.interactive !== false
  const source = useCommemorativeNftRenderer(props)
  const showRenderer = source.ready

  return (
    <>
      {showRenderer
        ? null
        : (props.placeholder ?? (
            <ArtworkPlaceholder
              failed={source.failed}
              showError={!props.onError}
            />
          ))}
      {props.rendererUrl && source.rendererStatus !== 'failed' ? (
        <iframe
          aria-hidden={!showRenderer}
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
          ref={source.rendererRef}
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
