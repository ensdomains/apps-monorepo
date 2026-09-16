import {
  type IconType,
  SiOpensea,
  SiTelegram,
  SiX,
} from '@icons-pack/react-simple-icons'
import { Trans } from '@lingui/react/macro'
import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { MSymbol } from '@/components/ui/material-symbol'
import { useCopyFeedback } from '@/hooks/useCopyFeedback'
import { cn } from '@/lib/utils'
import { startCommemorativeNftAssetDownload } from '../../commemorative-nft/assets'
import {
  buildCommemorativeNftRendererUrl,
  getCommemorativeNftConfig,
} from '../../commemorative-nft/config'
import { CommemorativeNftRendererSurface } from './CommemorativeNftRendererSurface'
import { CommemorativeNftSurpriseCard } from './CommemorativeNftSurpriseCard'
import type {
  CommemorativeNftCardData,
  MigrationSuccessDialogState,
} from './MigrationSuccessDialog.types'

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
  const { copy } = useCopyFeedback()
  const externalUrl = state.card.shareUrls.external
  const hasDownload = state.status === 'minted' && !!state.card.assets.imageUrl

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
        className={socialControlClassName}
        disabled={!hasDownload}
        onClick={() => {
          const assetUrl = state.card.assets.imageUrl
          if (!assetUrl) return
          startCommemorativeNftAssetDownload({
            assetUrl,
            filename: 'ensv2-commemorative-nft.webp',
          })
        }}
        type="button"
      >
        <MSymbol
          aria-hidden
          className="ms-wght-500 text-[20px]"
          symbol="download"
        />
        <span className="sr-only">
          <Trans>Download WebP</Trans>
        </span>
      </button>
    </fieldset>
  )
}

type CardVariant = 'dialog' | 'profile'
export type CommemorativeNftArtworkStatus =
  | 'loading'
  | 'ready'
  | 'error'
  | 'paused'

type ArtworkStatusCallback = (status: CommemorativeNftArtworkStatus) => void

const getArtworkStatus = (
  rendererStatus: CommemorativeNftArtworkStatus,
  imageStatus: CommemorativeNftArtworkStatus,
  imageUrl: string | undefined,
): CommemorativeNftArtworkStatus => {
  if (rendererStatus !== 'error') return rendererStatus
  return imageUrl ? imageStatus : 'error'
}

const CardFrame = ({
  children,
  variant,
}: {
  readonly children: ReactNode
  readonly variant: CardVariant
}) => (
  <div
    className={cn(
      'flex w-full items-center justify-center',
      variant === 'dialog' ? 'h-[310px]' : 'h-[308px]',
    )}
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

const ArtworkLoading = ({ paused = false }: { readonly paused?: boolean }) => (
  <div className="absolute inset-0" role="status">
    <CommemorativeNftSurpriseCard className="w-full" />
    <span className="sr-only">
      {paused ? (
        <Trans>Play artwork to preview your NFT.</Trans>
      ) : (
        <Trans>Loading NFT artwork…</Trans>
      )}
    </span>
  </div>
)

const ArtworkCard = ({
  interactive,
  onStatusChange,
  onRetry,
  rendererUrl,
  state,
  variant,
}: {
  readonly interactive: boolean
  readonly onStatusChange?: ArtworkStatusCallback
  readonly onRetry: () => void
  readonly rendererUrl: string | undefined
  readonly state: CardDialogState
  readonly variant: CardVariant
}) => {
  const [rendererStatus, setRendererStatus] =
    useState<CommemorativeNftArtworkStatus>('loading')
  const [imageStatus, setImageStatus] =
    useState<CommemorativeNftArtworkStatus>('loading')
  const onPausedChange = useCallback((paused: boolean) => {
    setRendererStatus((current) => {
      if (paused) return 'paused'
      return current === 'paused' ? 'loading' : current
    })
  }, [])
  const imageUrl = state.card.assets.imageUrl
  const showImage = rendererStatus === 'error' && !!imageUrl
  const status = getArtworkStatus(rendererStatus, imageStatus, imageUrl)
  const artworkReady = status === 'ready'
  const artworkFailed = status === 'error'

  useEffect(() => {
    onStatusChange?.(status)
  }, [onStatusChange, status])

  useEffect(() => {
    if (!showImage || imageStatus !== 'loading') return
    const timer = window.setTimeout(() => setImageStatus('error'), 10_000)
    return () => window.clearTimeout(timer)
  }, [imageStatus, showImage])

  return (
    <CardFrame variant={variant}>
      {rendererStatus === 'error' ? (
        artworkReady ? null : (
          <ArtworkLoading />
        )
      ) : (
        <CommemorativeNftRendererSurface
          eligibility={state.card.eligibility}
          interactive={interactive}
          onError={() => setRendererStatus('error')}
          onPausedChange={onPausedChange}
          onReady={() => setRendererStatus('ready')}
          placeholder={<ArtworkLoading paused={rendererStatus === 'paused'} />}
          rendererUrl={rendererUrl}
        />
      )}
      {showImage && imageStatus !== 'error' ? (
        <img
          alt={`Commemorative ENS NFT for ${state.card.eligibility.rendererName}`}
          aria-hidden={imageStatus !== 'ready'}
          className={cn(
            'absolute inset-0 h-full w-full rounded-lg object-contain drop-shadow-[0_7px_7px_rgba(90,0,36,0.2)]',
            imageStatus === 'ready' ? 'opacity-100' : 'opacity-0',
          )}
          onError={() => setImageStatus('error')}
          onLoad={(event) => {
            void event.currentTarget.decode().then(
              () =>
                setImageStatus((current) =>
                  current === 'loading' ? 'ready' : current,
                ),
              () => setImageStatus('error'),
            )
          }}
          src={imageUrl}
        />
      ) : null}
      {artworkFailed ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-lg bg-ens-garnet-100/95 p-4 text-center text-ens-garnet-900 text-sm">
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
      {artworkReady ? (
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
  interactive = true,
  onStatusChange,
  state,
  variant = 'profile',
}: {
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
      interactive={interactive}
      key={`${rendererUrl}:${cardState.card.eligibility.rendererName}:${cardState.card.assets.imageUrl}`}
      onStatusChange={onStatusChange}
      rendererUrl={rendererUrl}
      state={cardState}
      variant={variant}
    />
  )
}
