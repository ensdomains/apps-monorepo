import { Trans } from '@lingui/react/macro'
import { MSymbol } from '@/components/ui/material-symbol'
import { MigrationPrimaryButton } from '../MigrationPrimaryButton'
import { CommemorativeNftSurpriseCard } from './CommemorativeNftSurpriseCard'

type CommemorativeNftMintBannerProps = {
  readonly disabled?: boolean
  readonly onMint: () => void
}

export const CommemorativeNftMintBanner = ({
  disabled = false,
  onMint,
}: CommemorativeNftMintBannerProps) => (
  <section className="mx-4 rounded-lg border-[0.25px] border-border bg-linear-to-b from-ens-garnet-100 to-ens-garnet-200 px-6 py-12 md:mx-0">
    <div className="flex flex-col items-center justify-center gap-8 sm:flex-row sm:items-stretch">
      <CommemorativeNftSurpriseCard />
      <div className="flex w-full flex-col items-center justify-between gap-6 text-center sm:w-54.5 sm:items-start sm:text-left">
        <h2 className="font-normal font-sans text-[28px] text-ens-garnet-900 leading-[0.96] tracking-[0.01em]">
          <Trans>You're on ENSv2!</Trans>
        </h2>
        <div className="flex flex-col items-center gap-4 sm:items-start">
          <p className="max-w-54.5 font-sans text-ens-garnet-500 text-sm leading-[1.2]">
            <Trans>
              Here's a gift to celebrate your upgrade to the next era of ENS
            </Trans>
          </p>
          <MigrationPrimaryButton
            disabled={disabled}
            onClick={onMint}
            type="button"
          >
            <Trans>Mint</Trans>
            <MSymbol aria-hidden className="text-base" symbol="spa" />
          </MigrationPrimaryButton>
        </div>
      </div>
    </div>
  </section>
)
