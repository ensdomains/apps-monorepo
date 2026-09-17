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
  traits,
}: {
  readonly traits: RendererTraits
}) => {
  const { t } = useLingui()
  const { open, onOpenChange, ...pointerHandlers } = useTraitsPopover()
  const descriptionId = useId()

  return (
    <Popover onOpenChange={onOpenChange} open={open}>
      <PopoverTrigger asChild>
        <button
          className="flex size-11 shrink-0 items-center justify-center rounded-full border-4 border-transparent bg-ens-garnet-500 bg-clip-padding text-ens-garnet-100 transition-colors hover:bg-ens-garnet-600 focus-visible:outline-2 focus-visible:outline-ens-garnet-900 focus-visible:outline-offset-1 motion-reduce:transition-none"
          data-nft-traits-trigger
          type="button"
          {...pointerHandlers}
        >
          <MSymbol aria-hidden className="text-[20px]" symbol="info" />
          <span className="sr-only">
            <Trans>View NFT traits</Trans>
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-describedby={descriptionId}
        aria-label={t`NFT traits`}
        className="w-[181px] max-w-[calc(100vw-2rem)] rounded-[20px] border-0 bg-white px-3 py-3.5 text-center font-sans text-ens-garnet-900 text-xs leading-[1.2] tracking-[0.01em] motion-reduce:data-[state=closed]:animate-none motion-reduce:data-[state=open]:animate-none"
        collisionPadding={16}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => event.preventDefault()}
        side="left"
        sideOffset={4}
        {...pointerHandlers}
      >
        <p id={descriptionId}>
          <Trans>Your journey with ENS has given you these traits</Trans>
        </p>
        <ul className="flex flex-col gap-1.5 p-1.5 font-bold text-ens-garnet-500">
          <li>{traits.Era}</li>
          <li>{traits.Depth}</li>
          <li>{traits.Gasveteran}</li>
          <li>{traits.Archetype}</li>
          <li>{traits.Rarity}</li>
        </ul>
      </PopoverContent>
    </Popover>
  )
}
