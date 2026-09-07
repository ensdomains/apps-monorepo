import {
  type IconType,
  SiOpensea,
  SiTelegram,
  SiX,
} from '@icons-pack/react-simple-icons'
import { Trans } from '@lingui/react/macro'
import { type ReactNode, useState } from 'react'
import { MSymbol } from '@/components/ui/material-symbol'
import { useCopyFeedback } from '@/hooks/useCopyFeedback'
import { cn } from '@/lib/utils'
import { startCommemorativeNftAssetDownload } from '../../commemorative-nft/assets'
import {
  buildCommemorativeNftRendererUrl,
  getCommemorativeNftConfig,
} from '../../commemorative-nft/config'
import { CommemorativeNftRendererSurface } from './CommemorativeNftRendererSurface'
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

const ArtworkCard = ({
  interactive,
  state,
  variant,
}: {
  readonly interactive: boolean
  readonly state: CardDialogState
  readonly variant: CardVariant
}) => {
  const [artworkFailed, setArtworkFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const rendererUrl =
    state.card.assets.animationUrl ??
    buildCommemorativeNftRendererUrl({
      eligibility: state.card.eligibility,
      rendererOrigin: getCommemorativeNftConfig().rendererOrigin,
    })

  return (
    <fieldset
      aria-label={`Commemorative ENS NFT for ${state.card.eligibility.rendererName}`}
      className={cn(
        'flex items-center justify-center border-0 p-0',
        variant === 'dialog'
          ? 'h-[310px] w-[250px] min-w-0 shrink'
          : 'h-[308px] w-[236px] shrink-0',
      )}
    >
      <div
        className={cn(
          'relative rounded-lg bg-transparent drop-shadow-[0_7px_7px_rgba(90,0,36,0.2)]',
          variant === 'dialog' ? 'h-68.25 w-48.25' : 'h-70.5 w-50',
        )}
      >
        <CommemorativeNftRendererSurface
          eligibility={state.card.eligibility}
          interactive={interactive}
          key={attempt}
          onError={() => {
            setArtworkFailed(true)
          }}
          onReady={() => {
            setArtworkFailed(false)
          }}
          rendererUrl={rendererUrl}
        />
        {artworkFailed ? (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 rounded-lg bg-ens-garnet-100 p-4 text-center text-ens-garnet-900 text-sm">
            <p role="status">
              <Trans>Artwork could not be loaded.</Trans>
            </p>
            <button
              className="min-h-11 rounded-lg border border-ens-garnet-900 px-4 py-2 font-medium focus-visible:outline-2 focus-visible:outline-ens-garnet-900 focus-visible:outline-offset-2"
              onClick={() => {
                setArtworkFailed(false)
                setAttempt((current) => current + 1)
              }}
              type="button"
            >
              <Trans>Retry artwork</Trans>
            </button>
          </div>
        ) : null}
      </div>
    </fieldset>
  )
}

export const CommemorativeNftCard = ({
  interactive = true,
  state,
  variant = 'profile',
}: {
  readonly interactive?: boolean
  readonly state: MigrationSuccessDialogState
  readonly variant?: CardVariant
}) => {
  const cardState = hasCardData(state) ? state : undefined

  return (
    <div
      className={cn(
        'flex w-full items-center justify-center',
        variant === 'dialog' ? 'h-[310px]' : 'h-[308px] gap-1',
      )}
    >
      {cardState ? (
        <ArtworkCard
          interactive={interactive}
          key={`${cardState.card.eligibility.ownerAddress}:${cardState.card.eligibility.rendererName}`}
          state={cardState}
          variant={variant}
        />
      ) : (
        <p className="font-sans text-ens-garnet-500 text-sm" role="status">
          <Trans>Loading NFT details…</Trans>
        </p>
      )}
      {cardState ? <SharingRail state={cardState} /> : null}
    </div>
  )
}
