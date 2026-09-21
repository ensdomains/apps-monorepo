import { Trans, useLingui } from '@lingui/react/macro'
import { useId } from 'react'
import { MSymbol } from '@/components/ui/material-symbol'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import type { RendererTraits } from '../../commemorative-nft/types'
import { useTraitsPopover } from './useTraitsPopover'

export const CommemorativeNftTraitsTooltip = ({
  learnMoreUrl,
  marketplaceUrl,
  traits,
}: {
  readonly learnMoreUrl?: string
  readonly marketplaceUrl?: string
  readonly traits: RendererTraits
}) => {
  const { t } = useLingui()
  const { open: isOpen, onOpenChange, ...pointerHandlers } = useTraitsPopover()
  const descriptionId = useId()

  return (
    <Popover onOpenChange={onOpenChange} open={isOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex size-11 shrink-0 items-center justify-center rounded-full border-4 border-transparent bg-ens-garnet-500 bg-clip-padding text-ens-garnet-100 transition-colors hover:bg-ens-garnet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ens-garnet-900 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent motion-reduce:transition-none"
          data-nft-traits-trigger
          type="button"
          {...pointerHandlers}
        >
          <MSymbol aria-hidden className="text-xl/none" symbol="info" />
          <span className="sr-only">
            <Trans>View NFT traits</Trans>
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-describedby={descriptionId}
        aria-label={t`NFT traits`}
        // Keep a 1rem gutter on each viewport edge, matching collisionPadding.
        className="flex w-(--container-nft-traits) max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-(--radius-nft-traits) border-0 bg-white px-3 py-3.5 text-center font-sans text-ens-garnet-900 text-xs leading-ens-normal tracking-(--tracking-nft-traits) shadow-none motion-reduce:data-[state=closed]:animate-none motion-reduce:data-[state=open]:animate-none"
        collisionPadding={16}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => event.preventDefault()}
        side="left"
        sideOffset={4}
        {...pointerHandlers}
      >
        <p id={descriptionId}>
          <Trans>
            Your journey with ENS has given you these{' '}
            <span className="underline underline-offset-2">traits</span>
          </Trans>
        </p>
        <ul className="flex flex-wrap justify-center gap-x-1.5 gap-y-2 font-bold text-sm leading-4.5">
          <li>{traits.Era}</li>
          <li>{traits.Depth}</li>
          <li>{traits.Gasveteran}</li>
          <li>{traits.Archetype}</li>
          <li>{traits.Rarity}</li>
        </ul>
        <div className="flex items-center justify-between gap-3 text-ens-garnet-500">
          <a
            className="underline underline-offset-2 hover:text-ens-garnet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ens-garnet-900 focus-visible:ring-offset-2"
            href={learnMoreUrl ?? 'https://ens.domains/blog'}
            rel="noreferrer"
            target="_blank"
          >
            <Trans>
              Learn More<span className="sr-only"> about NFT traits</span>
            </Trans>
          </a>
          <a
            aria-disabled={!marketplaceUrl}
            className="ml-auto underline underline-offset-2 hover:text-ens-garnet-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ens-garnet-900 focus-visible:ring-offset-2"
            href={marketplaceUrl}
            rel="noreferrer"
            role={marketplaceUrl ? undefined : 'link'}
            target="_blank"
          >
            <Trans>OpenSea</Trans>
          </a>
        </div>
      </PopoverContent>
    </Popover>
  )
}
