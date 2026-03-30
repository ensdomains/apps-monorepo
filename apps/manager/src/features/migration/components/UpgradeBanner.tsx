import { Trans } from '@lingui/react/macro'
import { useNavigate } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'
import { GrainOverlay } from '@/features/migration/components/GrainOverlay'
import { UpgradeNamesButton } from '@/features/migration/components/UpgradeNamesButton'

export const UpgradeBanner = () => {
  const navigate = useNavigate()

  return (
    <div className="relative overflow-hidden rounded-none bg-gradient-to-b from-[#feeaf0] to-[rgba(255,150,202,0.5)] p-5 md:rounded-lg">
      <GrainOverlay />
      <div className="relative z-10 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-4">
            <h2 className="font-[419] text-ens-garnet-900 text-xl leading-[1.1] tracking-[-0.4px]">
              <Trans>Welcome to the new ENS app</Trans>
            </h2>
            <p className="text-[#e72a96] text-sm leading-[1.2] tracking-[0.14px] md:max-w-[70%]">
              <Trans>
                Upgrade your name(s) to unlock your new ENS profile and claim
                your commemorative NFT.
              </Trans>
            </p>
          </div>
          <button
            className="inline-flex cursor-pointer items-center gap-1 font-semi-mono text-[#e72a96] text-xs uppercase leading-[1.2] tracking-[0.12px]"
            onClick={() => navigate({ to: '/migration' })}
            type="button"
          >
            <Trans>See what&apos;s new</Trans>
            <ArrowUpRight className="size-5" />
          </button>
        </div>
        <UpgradeNamesButton />
      </div>
    </div>
  )
}
