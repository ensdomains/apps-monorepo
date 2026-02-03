import { CircleArrowLeft, CircleArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

type CardTheme = 'peridot' | 'garnet' | 'lapis' | 'bronzite'

interface EducationCard {
  readonly id: string
  readonly title: ReactNode
  readonly description: ReactNode
  readonly theme: CardTheme
}

const CARDS_PER_PAGE = 2

const educationCards: readonly EducationCard[] = [
  {
    id: 'one-username',
    title: (
      <>
        One username <span className="font-serif italic">everywhere.</span>
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
  },
  {
    id: 'verify-authenticity',
    title: (
      <>
        Verify <span className="font-serif italic">authenticity</span>
        <br />
        and stay safe.
      </>
    ),
    description:
      "Companies and projects use ENS because it's secured with ethereum, so you can be sure it's the real deal. Avoid impersonation scams and stay safe out there <3.",
    theme: 'garnet',
  },
  {
    id: 'digital-profile',
    title: (
      <>
        Your complete{' '}
        <span className="font-serif italic">digital profile.</span>
      </>
    ),
    description:
      'Add your avatar, social links, and crypto addresses to your ENS name. Your profile follows you across the web3 ecosystem.',
    theme: 'lapis',
  },
  {
    id: 'truly-yours',
    title: (
      <>
        Truly <span className="font-serif italic">yours.</span>
      </>
    ),
    description:
      'Your ENS name is an NFT — you own it, trade it, or give it away. No corporation can take it from you.',
    theme: 'bronzite',
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
  bronzite: {
    cardClass: 'bg-ens-bronzite-dust',
    textClass: 'text-ens-bronzite-core',
  },
}

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
                'flex flex-1 flex-col gap-8 overflow-clip rounded-[6px] p-5',
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
              <div
                className={cn(
                  'mt-auto flex h-[164px] w-full items-center justify-center rounded-[4px] bg-white/40 shadow-sm',
                )}
              >
                <span
                  className={cn(
                    'font-sans text-xs opacity-40',
                    config.textClass,
                  )}
                >
                  Illustration
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
