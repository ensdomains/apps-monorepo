import { CircleArrowLeft, CircleArrowRight } from 'lucide-react'
import { useState } from 'react'
import { FEATURE_CARDS } from '@/features/landing/FeaturesCarousel'
import { cn } from '@/lib/utils'
import * as m from '@/paraglide/messages.js'

const CARDS_PER_PAGE = 2

export const EducationCarousel = () => {
  const [currentPage, setCurrentPage] = useState(0)
  const totalPages = Math.ceil(FEATURE_CARDS.length / CARDS_PER_PAGE)

  const startIndex = currentPage * CARDS_PER_PAGE
  const visibleCards = FEATURE_CARDS.slice(
    startIndex,
    startIndex + CARDS_PER_PAGE,
  )

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h2 className="font-serif text-[28px] text-foreground leading-[0.96] tracking-[0.28px]">
          {m.educationTitle()}
        </h2>
        <div className="flex items-center gap-2">
          <button
            className={cn(
              'transition-colors',
              currentPage === 0 ? 'text-border' : 'text-ens-blue',
            )}
            disabled={currentPage === 0}
            onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
            type="button"
          >
            <CircleArrowLeft className="size-8" strokeWidth={1} />
          </button>
          <span className="text-muted-foreground text-xs leading-[1.2] tracking-[0.12px]">
            {m.educationPageIndicator({
              current: currentPage + 1,
              total: totalPages,
            })}
          </span>
          <button
            className={cn(
              'transition-colors',
              currentPage === totalPages - 1 ? 'text-border' : 'text-ens-blue',
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
        {visibleCards.map((card, index) => (
          <div
            className={cn(
              'flex w-full flex-col gap-8 overflow-hidden rounded-[6px] p-5 md:max-w-[428px] md:basis-1/2',
              card.className,
            )}
            // biome-ignore lint/suspicious/noArrayIndexKey: Hardcoded list
            key={startIndex + index}
          >
            <h3 className="font-medium text-[25px] leading-[0.96] tracking-[-0.5px]">
              {card.title}
            </h3>
            <p className="font-serif text-sm leading-none tracking-[-0.28px]">
              {card.description}
            </p>
            <div className="relative isolate mt-auto h-[164px] w-full overflow-hidden rounded-sm shadow-[0px_10px_14px_0px_rgba(14,61,104,0.06)]">
              <div
                className="relative h-[320px] origin-top-left scale-50 select-none"
                style={{ width: '200%' }}
              >
                {card.children}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
