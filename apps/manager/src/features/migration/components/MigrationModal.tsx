import { Trans, useLingui } from '@lingui/react/macro'
import { X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { GrainOverlay } from '@/features/migration/components/GrainOverlay'
import { ProfileCardPreview } from '@/features/migration/components/ProfileCardPreview'
import { UpgradeNamesButton } from '@/features/migration/components/UpgradeNamesButton'
import { useEligibleV1Names } from '@/features/migration/hooks/useEligibleV1Names'
import { useMigratedNamesCount } from '@/features/migration/hooks/useMigratedNamesCount'
import { useOpenModalOnFirstVisit } from '@/features/migration/hooks/useOpenModalOnFirstVisit'
import { useSmartAccountContext } from '@/lib/smart-account'

const AUTO_SCROLL_INTERVAL_MS = 5000

const SLIDE_DATA = [{ id: 'profiles' }] as const

export const MigrationModal = () => {
  const { t } = useLingui()
  const { isConnected } = useSmartAccountContext()
  const { eligible: eligibleV1Names, isPending: isEligibleV1NamesPending } =
    useEligibleV1Names()
  const { data: migratedCount, isPending: isMigratedCountPending } =
    useMigratedNamesCount()
  const eligibleNameCount = eligibleV1Names.length
  const hasUnstartedMigration =
    !isEligibleV1NamesPending &&
    !isMigratedCountPending &&
    eligibleNameCount > 0 &&
    (migratedCount ?? 0) === 0
  const { open, dismiss } = useOpenModalOnFirstVisit(
    isConnected,
    hasUnstartedMigration,
  )
  const [activeSlide, setActiveSlide] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  const slideLabels: Record<string, string> = {
    profiles: t`Custom Profiles`,
    nft: t`Commemorative NFT`,
    v2: t`ENS v2 Names`,
    experience: t`New Experience`,
  }

  const scrollToSlide = useCallback((index: number) => {
    setActiveSlide(index)
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ left: index * el.offsetWidth, behavior: 'smooth' })
  }, [])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const index = Math.round(el.scrollLeft / el.offsetWidth)
    setActiveSlide(index)
  }, [])

  useEffect(() => {
    if (!open || SLIDE_DATA.length <= 1) return
    const timer = setInterval(() => {
      scrollToSlide((activeSlide + 1) % SLIDE_DATA.length)
    }, AUTO_SCROLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [open, activeSlide, scrollToSlide])

  return (
    <Dialog
      onOpenChange={(value) => {
        if (!value) dismiss()
      }}
      open={open}
    >
      <DialogContent
        className="overflow-hidden border-0 bg-linear-to-b from-ens-garnet-100 to-ens-garnet-200 p-0 sm:max-w-[726px]"
        showCloseButton={false}
      >
        <GrainOverlay />

        <button
          className="absolute top-5 right-5 z-20 cursor-pointer text-ens-garnet-800 opacity-70 transition-opacity hover:opacity-100"
          onClick={dismiss}
          type="button"
        >
          <X className="size-5" />
          <span className="sr-only">
            <Trans>Close</Trans>
          </span>
        </button>

        <div className="relative z-10 mx-auto flex w-full max-w-[486px] flex-col items-center gap-4 px-5 pt-7 pb-7">
          <DialogTitle className="w-full pt-4 font-normal text-[32px] text-ens-garnet-900 leading-[1.1] tracking-[-0.64px]">
            <Trans>Welcome to the new ENS app!</Trans>
          </DialogTitle>
          <DialogDescription className="w-full text-base text-ens-garnet-500 leading-[1.2] tracking-[-0.24px]">
            <Trans>
              Upgrade your name(s) in just a couple steps to unlock your new ENS
              profile and claim your commemorative NFT.
            </Trans>
          </DialogDescription>

          {SLIDE_DATA.length > 1 && (
            <div className="flex items-center gap-0.5">
              {SLIDE_DATA.map((slide, i) => (
                <button
                  className={`h-1.5 rounded-full transition-all ${
                    i === activeSlide
                      ? 'w-[19px] bg-ens-garnet-500'
                      : 'w-[7px] bg-ens-garnet-500/50'
                  }`}
                  key={slide.id}
                  onClick={() => scrollToSlide(i)}
                  type="button"
                >
                  <span className="sr-only">
                    <Trans>Slide {i + 1}</Trans>
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="w-full overflow-hidden">
            <div
              className="flex snap-x snap-mandatory overflow-x-auto [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              onScroll={handleScroll}
              ref={scrollRef}
            >
              {SLIDE_DATA.map((slide) => (
                <div
                  className="flex w-full shrink-0 snap-center flex-col items-center gap-4 px-5"
                  key={slide.id}
                >
                  <ProfileCardPreview />
                  <p className="font-semi-mono text-ens-garnet-500 text-xs uppercase leading-[1.2] tracking-[0.12px]">
                    {slideLabels[slide.id]}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* biome-ignore lint/a11y/useKeyWithClickEvents: dismiss wrapper, button inside handles keyboard */}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: dismiss wrapper, button inside handles keyboard */}
          <div
            className="flex w-full max-w-[313px] flex-col items-start gap-2"
            onClick={dismiss}
          >
            <UpgradeNamesButton className="w-full tracking-[1.68px]" />
            {eligibleNameCount > 0 && (
              <p className="w-full font-semi-mono text-[10px] text-ens-garnet-900 uppercase leading-[1.2] tracking-[0.1px]">
                <Trans>
                  You have{' '}
                  <span className="font-medium">{eligibleNameCount}</span> names
                  that are eligible for upgrade
                </Trans>
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
