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
import { UpgradeNamesButton } from '@/features/migration/components/UpgradeNamesButton'
import { useAutoScrollCarousel } from '@/features/migration/hooks/useAutoScrollCarousel'
import { useV1Names } from '@/features/migration/hooks/useV1Names'
import { useSmartAccountContext } from '@/lib/smart-account'

const STORAGE_KEY = 'migration-modal-dismissed'
const AUTO_SCROLL_INTERVAL = 5000

const SLIDE_DATA = [
  {
    id: 'profiles',
    image: 'https://placehold.co/192x270/e5e5e5/737373?text=Preview',
  },
  {
    id: 'nft',
    image: 'https://placehold.co/192x270/e5e5e5/737373?text=Preview',
  },
  {
    id: 'v2',
    image: 'https://placehold.co/192x270/e5e5e5/737373?text=Preview',
  },
  {
    id: 'experience',
    image: 'https://placehold.co/192x270/e5e5e5/737373?text=Preview',
  },
]

export const MigrationModal = () => {
  const { t } = useLingui()
  const { isConnected } = useSmartAccountContext()
  const { data: v1Names } = useV1Names()
  const hasV1Names = (v1Names?.length ?? 0) > 0
  const [open, setOpen] = useState(false)
  const [activeSlide, setActiveSlide] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  const slideLabels: Record<string, string> = {
    profiles: t`Custom Profiles`,
    nft: t`Commemorative NFT`,
    v2: t`ENS v2 Names`,
    experience: t`New Experience`,
  }

  useEffect(() => {
    if (
      isConnected &&
      hasV1Names &&
      localStorage.getItem(STORAGE_KEY) !== 'true'
    ) {
      setOpen(true)
    }
  }, [isConnected, hasV1Names])

  const scrollToSlide = useCallback((index: number) => {
    setActiveSlide(index)
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ left: index * el.offsetWidth, behavior: 'smooth' })
  }, [])

  const handleDismiss = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true')
    setOpen(false)
  }, [])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const index = Math.round(el.scrollLeft / el.offsetWidth)
    setActiveSlide(index)
  }, [])

  const { reset: resetAutoScroll } = useAutoScrollCarousel({
    enabled: open,
    intervalMs: AUTO_SCROLL_INTERVAL,
    totalSlides: SLIDE_DATA.length,
    onSlideChange: scrollToSlide,
  })

  const handleManualNav = useCallback(
    (index: number) => {
      scrollToSlide(index)
      resetAutoScroll()
    },
    [scrollToSlide, resetAutoScroll],
  )

  return (
    <Dialog
      onOpenChange={(value) => {
        if (!value) handleDismiss()
      }}
      open={open}
    >
      <DialogContent
        className="overflow-hidden border-0 bg-linear-to-b from-[#feeaf0] to-[#ffc6e0] p-0 sm:max-w-[420px]"
        showCloseButton={false}
      >
        <GrainOverlay />

        {/* Close button */}
        <button
          className="absolute top-5 right-5 z-20 cursor-pointer text-[#4a0326] opacity-70 transition-opacity hover:opacity-100"
          onClick={handleDismiss}
          type="button"
        >
          <X className="size-5" />
          <span className="sr-only">
            <Trans>Close</Trans>
          </span>
        </button>

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center gap-4 px-5 pt-7 pb-7">
          <DialogTitle className="w-full pt-4 font-normal text-[32px] text-ens-garnet-900 leading-[1.1] tracking-[-0.64px]">
            <Trans>Welcome to the new ENS app!</Trans>
          </DialogTitle>
          <DialogDescription className="w-full text-[#e72a96] text-sm leading-[1.2] tracking-[-0.21px]">
            <Trans>
              Upgrade your name(s) to unlock your new ENS profile and claim your
              commemorative NFT.
            </Trans>
          </DialogDescription>

          {/* Pagination dots */}
          <div className="flex items-center gap-0.5">
            {SLIDE_DATA.map((slide, i) => (
              <button
                className={`h-1.5 rounded-full transition-all ${
                  i === activeSlide
                    ? 'w-[19px] bg-[#e72a96]'
                    : 'w-[7px] bg-[#e72a96]/50'
                }`}
                key={slide.id}
                onClick={() => handleManualNav(i)}
                type="button"
              >
                <span className="sr-only">
                  <Trans>Slide {i + 1}</Trans>
                </span>
              </button>
            ))}
          </div>

          {/* Carousel */}
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
                  <div className="overflow-hidden rounded-2xl border-[0.1px] border-[rgba(25,87,128,0.2)] shadow-[0px_5.7px_8.2px_0px_rgba(90,0,36,0.3)]">
                    <img
                      alt=""
                      className="h-[270px] w-[192px] object-cover"
                      src={slide.image}
                    />
                  </div>
                  <p className="font-semi-mono text-[#e72a96] text-xs uppercase leading-[1.2] tracking-[0.12px]">
                    {slideLabels[slide.id]}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* CTA button */}
          <UpgradeNamesButton className="w-full max-w-[313px] tracking-[1.68px]" />
        </div>
      </DialogContent>
    </Dialog>
  )
}
