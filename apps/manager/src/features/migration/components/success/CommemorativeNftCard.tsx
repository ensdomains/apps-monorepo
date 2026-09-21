import {
  type IconType,
  SiDiscord,
  SiOpensea,
  SiTelegram,
  SiX,
} from '@icons-pack/react-simple-icons'
import { Trans, useLingui } from '@lingui/react/macro'
import { useReducedMotion } from 'motion/react'
import {
  type ReactNode,
  type Ref,
  useEffect,
  useReducer,
  useState,
} from 'react'
import { toast } from 'sonner'
import { MSymbol } from '@/components/ui/material-symbol'
import { useCopyFeedback } from '@/hooks/useCopyFeedback'
import { copyToClipboard } from '@/lib/clipboard'
import { cn } from '@/lib/utils'
import {
  buildCommemorativeNftRendererUrl,
  getCommemorativeNftConfig,
} from '../../commemorative-nft/config'
import { trackNftEvent } from '../../commemorative-nft/diagnostics'
import { CommemorativeNftRendererSurface } from './CommemorativeNftRendererSurface'
import { CommemorativeNftSurpriseCard } from './CommemorativeNftSurpriseCard'
import type {
  CommemorativeNftCardData,
  MigrationSuccessDialogState,
} from './MigrationSuccessDialog.types'
import { useNftArtworkLoading } from './useNftArtworkLoading'
import { useNftArtworkVisibility } from './useNftArtworkVisibility'
import { useNftAssetDownload } from './useNftAssetDownload'
import { useNftReveal } from './useNftReveal'

type SocialControlProps = {
  readonly href?: string
  readonly icon: IconType
  readonly onClick?: () => void
  readonly children: ReactNode
}

const socialControlClassName =
  'flex size-11 items-center justify-center rounded-full border-4 border-transparent bg-white bg-clip-padding text-ens-garnet-500 transition-colors hover:bg-ens-garnet-50 focus-visible:outline-2 focus-visible:outline-ens-garnet-900 focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none'

type CardDialogState = MigrationSuccessDialogState & {
  readonly card: CommemorativeNftCardData
}

const hasCardData = (
  state: MigrationSuccessDialogState,
): state is CardDialogState => 'card' in state && !!state.card

const SocialControl = ({
  href,
  icon: Icon,
  onClick,
  children,
}: SocialControlProps) => {
  if (href) {
    return (
      <a
        className={socialControlClassName}
        href={href}
        rel="noreferrer"
        target="_blank"
      >
        <Icon aria-hidden className="size-4.5" />
        <span className="sr-only">{children}</span>
      </a>
    )
  }

  return (
    <button
      className={socialControlClassName}
      disabled={!onClick}
      onClick={onClick}
      type="button"
    >
      <Icon aria-hidden className="size-4.5" />
      <span className="sr-only">{children}</span>
    </button>
  )
}

const SharingRail = ({ state }: { readonly state: CardDialogState }) => {
  const { t } = useLingui()
  const { copy } = useCopyFeedback()
  const externalUrl = state.card.shareUrls.external
  const discordMessage = state.card.shareUrls.message
  const hasDownload = !!state.card.assets.imageUrl
  const { download, pending } = useNftAssetDownload(state.card.assets.imageUrl)

  const shareOnDiscord = () => {
    if (!discordMessage) return
    void copyToClipboard(discordMessage)
      .then(() => toast.success(t`Message copied. Paste it into Discord.`))
      .catch(() => toast.error(t`Could not copy the message.`))
    window.open(
      'https://discord.com/channels/@me',
      '_blank',
      'noopener,noreferrer',
    )
  }

  return (
    <fieldset className="relative z-10 flex shrink-0 flex-col border-0 p-0">
      <legend className="sr-only">
        <Trans>NFT actions</Trans>
      </legend>
      <SocialControl href={state.card.shareUrls.x} icon={SiX}>
        <Trans>Share on X</Trans>
      </SocialControl>
      <SocialControl href={state.card.shareUrls.telegram} icon={SiTelegram}>
        <Trans>Share on Telegram</Trans>
      </SocialControl>
      <SocialControl
        icon={SiDiscord}
        onClick={discordMessage ? shareOnDiscord : undefined}
      >
        <Trans>Copy message and open Discord</Trans>
      </SocialControl>
      {state.card.marketplaceUrl ? (
        <SocialControl href={state.card.marketplaceUrl} icon={SiOpensea}>
          <Trans>View on OpenSea</Trans>
        </SocialControl>
      ) : null}
      <button
        className={socialControlClassName}
        disabled={!externalUrl}
        onClick={() => externalUrl && void copy(externalUrl)}
        type="button"
      >
        <MSymbol
          aria-hidden
          className="ms-wght-500 text-[20px]"
          symbol="content_copy"
        />
        <span className="sr-only">
          <Trans>Copy link</Trans>
        </span>
      </button>
      <button
        aria-busy={pending}
        className={socialControlClassName}
        disabled={!hasDownload || pending}
        onClick={download}
        type="button"
      >
        <MSymbol
          aria-hidden
          className="ms-wght-500 text-[20px]"
          symbol={pending ? 'hourglass' : 'download'}
        />
        <span className="sr-only">
          {pending ? (
            <Trans>Downloading artwork…</Trans>
          ) : (
            <Trans>Download WebP</Trans>
          )}
        </span>
      </button>
    </fieldset>
  )
}

type CardVariant = 'dialog' | 'profile'
export type CommemorativeNftArtworkStatus = 'loading' | 'ready' | 'error'

type ArtworkStatusCallback = (status: CommemorativeNftArtworkStatus) => void

const CardFrame = ({
  children,
  frameRef,
  variant,
}: {
  readonly children: ReactNode
  readonly frameRef?: Ref<HTMLDivElement>
  readonly variant: CardVariant
}) => (
  <div
    className={cn(
      'flex w-full items-center justify-center',
      variant === 'dialog' ? 'h-[310px]' : 'h-[308px]',
    )}
    ref={frameRef}
  >
    <div
      className={cn(
        // Equal space on both sides keeps the artwork centered. The sharing
        // rail sits outside this frame instead of shifting the card left.
        'relative',
        variant === 'dialog'
          ? 'aspect-[193/273] w-[min(193px,calc(100%-7rem))]'
          : 'aspect-[200/282] w-[min(200px,calc(100%-7rem))]',
      )}
    >
      {children}
    </div>
  </div>
)

const ArtworkLoading = () => (
  <div className="absolute inset-0" role="status">
    <CommemorativeNftSurpriseCard className="w-full" />
    <span className="sr-only">
      <Trans>Loading NFT artwork…</Trans>
    </span>
  </div>
)

const shouldAnimateReveal = (
  variant: CardVariant,
  status: MigrationSuccessDialogState['status'],
  reducedMotion: boolean | null,
) => variant === 'dialog' && status !== 'minted' && !reducedMotion

const useRevealedArtwork = (
  params: Parameters<typeof useNftArtworkLoading>[0] & {
    readonly revealEnabled: boolean
    readonly visible: boolean
  },
) => {
  const [revealFinished, finishReveal] = useReducer(() => true, false)
  const artwork = useNftArtworkLoading({
    ...params,
    deferAnimation: params.revealEnabled && !revealFinished,
  })
  const reveal = useNftReveal({
    enabled: params.revealEnabled && !artwork.imageFailed,
    onComplete: finishReveal,
    status: artwork.status,
    visible: params.visible,
  })
  return { artwork, reveal }
}

const ArtworkCard = ({
  active,
  interactive,
  onStatusChange,
  onRetry,
  rendererUrl,
  state,
  variant,
}: {
  readonly active: boolean
  readonly interactive: boolean
  readonly onStatusChange?: ArtworkStatusCallback
  readonly onRetry: () => void
  readonly rendererUrl: string | undefined
  readonly state: CardDialogState
  readonly variant: CardVariant
}) => {
  const visibility = useNftArtworkVisibility(active)
  const shouldReduceMotion = useReducedMotion()
  const [playArtwork, setPlayArtwork] = useState(false)
  const reducedMotionStill = !!shouldReduceMotion && !playArtwork
  const imageUrl = state.card.assets.imageUrl
  const revealEnabled = shouldAnimateReveal(
    variant,
    state.status,
    shouldReduceMotion,
  )
  const { artwork, reveal } = useRevealedArtwork({
    imageUrl,
    revealEnabled,
    visible: visibility.visible,
    animate: visibility.visible && !reducedMotionStill,
    waitingForVisibility: active && !reducedMotionStill && !visibility.resolved,
  })
  const { status } = artwork
  const artworkReady = status === 'ready'
  const artworkFailed = status === 'error'
  const {
    ready: presentationReady,
    showArtwork,
    status: presentationStatus,
  } = reveal

  useEffect(() => {
    onStatusChange?.(presentationStatus)
  }, [onStatusChange, presentationStatus])

  useEffect(() => {
    if (shouldReduceMotion)
      trackNftEvent('nft:renderer_fallback', { reason: 'reduced_motion' })
  }, [shouldReduceMotion])

  return (
    <CardFrame frameRef={visibility.ref} variant={variant}>
      <div
        aria-hidden={showArtwork || artworkFailed}
        className={cn(
          'pointer-events-none absolute inset-0 z-10 transition-opacity duration-600 ease-out motion-reduce:transition-none',
          showArtwork ? 'opacity-0' : 'opacity-100',
        )}
      >
        <ArtworkLoading />
      </div>
      <div
        className={cn(
          'absolute inset-0 transition-opacity duration-600 ease-out data-[revealing=true]:overflow-hidden data-[revealing=true]:rounded-lg motion-reduce:transition-none',
          showArtwork ? 'opacity-100' : 'opacity-0',
        )}
        data-revealing={reveal.running}
      >
        {artwork.imageReady ? (
          <img
            alt={`Commemorative ENS NFT for ${state.card.eligibility.rendererName}`}
            aria-hidden={!artworkReady}
            className={cn(
              'absolute inset-0 h-full w-full rounded-lg object-contain drop-shadow-[0_7px_7px_rgba(90,0,36,0.2)] transition-opacity duration-300 ease-out motion-reduce:transition-none',
              artworkReady && !artwork.animationReady
                ? 'opacity-100'
                : 'opacity-0',
            )}
            decoding="async"
            src={imageUrl}
          />
        ) : null}
        {artwork.renderAnimation ? (
          <CommemorativeNftRendererSurface
            eligibility={state.card.eligibility}
            interactive={interactive}
            onError={artwork.onRendererError}
            onReady={artwork.onRendererReady}
            placeholder={false}
            rendererUrl={rendererUrl}
          />
        ) : null}
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-lg"
        ref={reveal.host}
      />
      {reducedMotionStill && artworkReady ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <button
            className="pointer-events-auto min-h-11 rounded-lg border border-ens-garnet-900 bg-ens-garnet-100 px-4 py-2 text-ens-garnet-900 text-sm focus-visible:outline-2 focus-visible:outline-ens-garnet-900 focus-visible:outline-offset-2"
            onClick={() => setPlayArtwork(true)}
            type="button"
          >
            <Trans>Play artwork</Trans>
          </button>
        </div>
      ) : null}
      {artworkFailed ? (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-lg bg-ens-garnet-100/95 p-4 text-center text-ens-garnet-900 text-sm">
          <p role="status">
            <Trans>Artwork could not be loaded.</Trans>
          </p>
          <button
            className="min-h-11 rounded-lg border border-ens-garnet-900 px-4 py-2 font-medium focus-visible:outline-2 focus-visible:outline-ens-garnet-900 focus-visible:outline-offset-2"
            onClick={onRetry}
            type="button"
          >
            <Trans>Retry artwork</Trans>
          </button>
        </div>
      ) : null}
      {presentationReady ? (
        <div className="absolute top-1/2 left-full ml-3 -translate-y-1/2">
          <SharingRail state={state} />
        </div>
      ) : null}
    </CardFrame>
  )
}

const RetryableArtworkCard = (
  props: Omit<Parameters<typeof ArtworkCard>[0], 'onRetry'>,
) => {
  const [attempt, setAttempt] = useState(0)
  return (
    <ArtworkCard
      {...props}
      key={attempt}
      onRetry={() => setAttempt((current) => current + 1)}
    />
  )
}

export const CommemorativeNftCard = ({
  active = true,
  interactive = true,
  onStatusChange,
  state,
  variant = 'profile',
}: {
  readonly active?: boolean
  readonly interactive?: boolean
  readonly onStatusChange?: ArtworkStatusCallback
  readonly state: MigrationSuccessDialogState
  readonly variant?: CardVariant
}) => {
  const cardState = hasCardData(state) ? state : undefined
  const rendererOrigin = getCommemorativeNftConfig().rendererOrigin
  const rendererUrl = cardState
    ? buildCommemorativeNftRendererUrl({
        eligibility: cardState.card.eligibility,
        rendererOrigin,
      })
    : undefined

  if (!cardState)
    return (
      <CardFrame variant={variant}>
        <ArtworkLoading />
      </CardFrame>
    )

  return (
    <RetryableArtworkCard
      active={active}
      interactive={interactive}
      key={`${rendererUrl}:${cardState.card.eligibility.rendererName}:${cardState.card.assets.imageUrl}`}
      onStatusChange={onStatusChange}
      rendererUrl={rendererUrl}
      state={cardState}
      variant={variant}
    />
  )
}
