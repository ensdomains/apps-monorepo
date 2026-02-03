import { CircleArrowLeft, CircleArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'
import card_1_1 from '@/assets/pages/landing/card-1-1.webp'
import card_1_2 from '@/assets/pages/landing/card-1-2.webp'
import card_1_3 from '@/assets/pages/landing/card-1-3.webp'
import {
  BgPattern,
  ChatBubble,
  Sparkle,
} from '@/features/landing/components/primitives'
import { cn } from '@/lib/utils'

type CardTheme = 'peridot' | 'garnet' | 'lapis'

interface EducationCard {
  readonly id: string
  readonly title: ReactNode
  readonly description: ReactNode
  readonly theme: CardTheme
  readonly illustration: ReactNode
}

const educationCards: readonly EducationCard[] = [
  {
    id: 'one-username',
    title: (
      <>
        One username{' '}
        <span className="font-normal font-serif italic">everywhere.</span>
      </>
    ),
    description: (
      <>
        Your name lives onchain — you own it, not a platform. Sign in to web3
        apps with your <span className="font-medium font-sans">.eth name</span>{' '}
        and your ENS profile will load automatically.
      </>
    ),
    theme: 'peridot',
    illustration: (
      <>
        <div className="absolute inset-0 overflow-hidden rounded-sm">
          <BgPattern className="opacity-90" />
          <div className="absolute inset-0 bg-linear-130 from-25% from-[#e4e5e4cc] to-110% to-[#92ad9acc]" />
        </div>
        <img
          alt=""
          className="-top-3 pointer-events-none absolute left-2 w-[45%] rounded-sm shadow-md"
          src={card_1_1}
        />
        <img
          alt=""
          className="pointer-events-none absolute bottom-0 left-[28%] w-[45%] rounded-sm shadow-md"
          src={card_1_2}
        />
        <img
          alt=""
          className="-bottom-6 pointer-events-none absolute right-2 w-[45%] rounded-sm shadow-md"
          src={card_1_3}
        />
      </>
    ),
  },
  {
    id: 'verify-authenticity',
    title: (
      <>
        Verify{' '}
        <span className="font-normal font-serif italic">authenticity</span>
        <br />
        and stay safe.
      </>
    ),
    description:
      "Companies and projects use ENS because it's secured with ethereum, so you can be sure it's the real deal. Avoid impersonation scams and stay safe out there <3.",
    theme: 'garnet',
    illustration: (
      <>
        <div className="absolute inset-0 overflow-hidden rounded-sm">
          <BgPattern className="opacity-90" />
          <div className="absolute inset-0 bg-linear-290 from-55% from-[#FFEFF6CC] to-130% to-[#F886B64D] opacity-90" />
        </div>
        <div
          className="absolute inset-0 origin-top-left scale-50 select-none"
          style={{ width: '200%', height: '200%' }}
        >
          <div className="absolute inset-6 flex flex-col gap-4">
            <div className="flex flex-col items-start gap-2">
              <div className="flex items-center gap-2">
                <div className="size-9 rounded-full bg-ens-garnet-surface" />
                <div className="rounded-md bg-ens-garnet-dense p-1.5 font-medium text-sm text-white leading-ens-tight">
                  support.company.eth
                </div>
              </div>
              <ChatBubble>Can you share your order number?</ChatBubble>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center justify-end gap-2">
                <div className="size-9 rounded-full bg-ens-garnet-surface" />
                <div className="rounded-md bg-ens-garnet-core p-1.5 font-medium text-sm text-white leading-ens-tight">
                  you.eth
                </div>
              </div>
              <ChatBubble kind="reply">
                No problem. I just checked your
                <br />
                ENS profile, you're legit! It's HGJLY ☺️
              </ChatBubble>
            </div>
          </div>
        </div>
      </>
    ),
  },
  {
    id: 'get-paid',
    title: (
      <>
        A simpler way to{' '}
        <span className="font-normal font-serif italic">get paid.</span>
      </>
    ),
    description: (
      <>
        Your ENS name replaces your wallet addresses so friends and clients can
        send money to <span className="font-medium font-sans">friend.eth</span>{' '}
        instead of a confusing jumble of letters and numbers.
      </>
    ),
    theme: 'lapis',
    illustration: (
      <>
        <div className="absolute inset-0 overflow-hidden rounded-sm">
          <BgPattern className="opacity-30" />
          <div className="absolute inset-0 bg-linear-125 from-22% from-[#FEFEFE00] to-63% to-[#EDF1F2] opacity-80" />
        </div>
        <div
          className="absolute inset-0 origin-top-left scale-50 select-none"
          style={{ width: '200%', height: '200%' }}
        >
          <div className="absolute top-10 left-10 w-1/3 max-w-3xs">
            <div className="relative rounded-[6px] bg-ens-lapis-dense/50 p-3">
              <span className="block w-full bg-linear-90 from-white to-transparent bg-clip-text font-medium font-semi-mono text-transparent text-xs">
                0x0b08dA7068b73A579Bd5E8a8290f
              </span>
              <span className="-translate-1/2 absolute top-0 left-0 text-[28px] leading-none">
                🫣
              </span>
              <span className="-translate-y-1/2 absolute top-1/2 right-0 translate-x-[115%] text-[32px] leading-none">
                🫷
              </span>
            </div>
          </div>
          <div className="-translate-1/2 absolute top-[55%] left-1/2">
            <div className="relative rounded-[6px] bg-linear-90 from-ens-lapis-core to-[#21B8FF] p-3">
              <Sparkle className="-top-8 -left-13 absolute h-8" />
              <Sparkle className="-bottom-7 -left-8 absolute h-8" />
              <Sparkle className="-right-14 -top-2 absolute h-8" />
              <Sparkle className="-bottom-12 -right-4 absolute h-8 rotate-180" />
              <Sparkle className="-bottom-17 -right-11 absolute h-8" />
              <span className="block w-full font-medium font-semi-mono text-lg text-white">
                friend.eth
              </span>
              <span className="-translate-1/2 absolute top-0 left-0 text-[28px] leading-none">
                😌
              </span>
              <span className="-translate-y-1/2 absolute top-1/2 right-0 translate-x-5/6 text-[28px] leading-none">
                🫶
              </span>
            </div>
          </div>
        </div>
      </>
    ),
  },
]

const themeConfig: Record<
  CardTheme,
  {
    cardClass: string
    textClass: string
    cardStyle?: React.CSSProperties
  }
> = {
  peridot: {
    cardClass: 'bg-ens-peridot-dust',
    textClass: 'text-ens-peridot-core',
  },
  garnet: {
    cardClass: '',
    textClass: 'text-ens-garnet-core',
    cardStyle: {
      backgroundImage: 'linear-gradient(175deg, #ffd5e9 5%, #fecee2 100%)',
    },
  },
  lapis: {
    cardClass: 'bg-ens-lapis-dust',
    textClass: 'text-ens-lapis-core',
  },
}

const CARDS_PER_PAGE = 2

export const EducationCarousel = () => {
  const [currentPage, setCurrentPage] = useState(0)
  const totalPages = Math.ceil(educationCards.length / CARDS_PER_PAGE)

  const startIndex = currentPage * CARDS_PER_PAGE
  const visibleCards = educationCards.slice(
    startIndex,
    startIndex + CARDS_PER_PAGE,
  )

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h2 className="font-serif text-[28px] text-foreground leading-[0.96] tracking-[0.28px]">
          Did You Know?
        </h2>
        <div className="flex items-center gap-2">
          <button
            className={cn(
              'text-foreground transition-opacity',
              currentPage === 0 && 'opacity-30',
            )}
            disabled={currentPage === 0}
            onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
            type="button"
          >
            <CircleArrowLeft className="size-8" strokeWidth={1} />
          </button>
          <span className="text-muted-foreground text-xs leading-[1.2] tracking-[0.12px]">
            {currentPage + 1} of {totalPages}
          </span>
          <button
            className={cn(
              'text-foreground transition-opacity',
              currentPage === totalPages - 1 && 'opacity-30',
            )}
            disabled={currentPage === totalPages - 1}
            onClick={() =>
              setCurrentPage((p) => Math.min(totalPages - 1, p + 1))
            }
            type="button"
          >
            <CircleArrowRight className="size-8" strokeWidth={1} />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-5 md:flex-row">
        {visibleCards.map((card) => {
          const config = themeConfig[card.theme]
          return (
            <div
              className={cn(
                'flex w-full flex-col gap-8 overflow-hidden rounded-[6px] p-5 md:max-w-[428px] md:basis-1/2',
                config.cardClass,
              )}
              key={card.id}
              style={config.cardStyle}
            >
              <h3
                className={cn(
                  'font-medium font-sans text-[25px] leading-[0.96] tracking-[-0.5px]',
                  config.textClass,
                )}
              >
                {card.title}
              </h3>
              <p
                className={cn(
                  'font-serif text-sm leading-none tracking-[-0.28px]',
                  config.textClass,
                )}
              >
                {card.description}
              </p>
              <div className="relative isolate mt-auto h-[164px] w-full overflow-hidden rounded-sm shadow-[0px_10px_14px_0px_rgba(14,61,104,0.06)]">
                {card.illustration}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
