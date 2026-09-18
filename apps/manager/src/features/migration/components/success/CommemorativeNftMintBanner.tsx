import { Trans } from '@lingui/react/macro'
import { MSymbol } from '@/components/ui/material-symbol'
import { MigrationPrimaryButton } from '../MigrationPrimaryButton'
import { CommemorativeNftSurpriseCard } from './CommemorativeNftSurpriseCard'

type CommemorativeNftMintBannerProps = {
  readonly disabled?: boolean
  readonly onMint: () => void
  readonly status?: 'ready' | 'pending-claim' | 'reconciling'
}

export const CommemorativeNftMintBanner = ({
  disabled = false,
  onMint,
  status = 'ready',
}: CommemorativeNftMintBannerProps) => (
  // Use the same quarter-pixel hairline as the profile surfaces; a standard 1px border is too prominent on the pale gradient.
  <section className="mx-4 rounded-lg border-[0.25px] border-border bg-linear-to-b from-ens-garnet-100 to-ens-garnet-200 px-6 py-12 md:mx-0">
    <div className="flex flex-col items-center justify-center gap-8 sm:flex-row sm:items-stretch">
      <CommemorativeNftSurpriseCard />
      <div className="flex w-full flex-col items-center justify-between gap-6 text-center sm:w-54.5 sm:items-start sm:text-left">
        {/* The 28px heading and 0.01em tracking preserve its wrapping beside the surprise card; no matching typography tokens exist. */}
        <h2 className="font-normal font-sans text-[28px] text-ens-garnet-900 leading-ens-none tracking-[0.01em]">
          {status === 'reconciling' ? (
            <Trans>Your commemorative NFT</Trans>
          ) : (
            <Trans>You're on ENSv2!</Trans>
          )}
        </h2>
        <div className="flex flex-col items-center gap-4 sm:items-start">
          <p className="max-w-54.5 font-sans text-ens-garnet-500 text-sm leading-ens-normal">
            {status === 'reconciling' ? (
              <Trans>
                Your upgrades still need to be verified. Check again to
                continue.
              </Trans>
            ) : status === 'pending-claim' ? (
              <Trans>
                Your mint was submitted. Check its status to continue.
              </Trans>
            ) : (
              <Trans>
                Here's a gift to celebrate your upgrade to the next era of ENS
              </Trans>
            )}
          </p>
          <MigrationPrimaryButton
            disabled={disabled}
            onClick={onMint}
            type="button"
          >
            {status === 'ready' ? (
              <>
                <Trans>Mint</Trans>
                <MSymbol aria-hidden className="text-base" symbol="spa" />
              </>
            ) : (
              <Trans>Check status</Trans>
            )}
          </MigrationPrimaryButton>
        </div>
      </div>
    </div>
  </section>
)
