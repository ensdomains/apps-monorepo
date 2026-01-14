import { ChevronLeft, ChevronRight } from 'lucide-react'

const CARDS = Array.from({ length: 10 }).map((_, i) => ({
  id: i,
  variant: i % 2 === 0 ? 'green' : 'pink',
}))

export const DidYouKnowSection = () => (
  <div className="rounded-[8px] border-[#dededf] border-[0.25px] bg-white px-4 py-6 md:px-[24px] md:py-[32px]">
    <div className="mb-6 flex flex-col gap-4 md:mb-[32px] md:flex-row md:items-center md:justify-between">
      <h2 className="font-serif text-[#232222] text-[24px] leading-[0.96] tracking-[0.24px] md:text-[28px] md:tracking-[0.28px]">
        Did You Know?
      </h2>

      <div className="flex items-center justify-end gap-[8px]">
        <button
          className="relative size-[28px] shrink-0 text-[#bcbcbc] hover:text-[#232222] md:size-[32px]"
          type="button"
        >
          <ChevronLeft className="size-full" strokeWidth={1} />
        </button>
        <span className="font-sans text-[#7d7d7d] text-[11px] leading-[1.2] tracking-[0.11px] md:text-[12px] md:tracking-[0.12px]">
          2 of 10
        </span>
        <button
          className="relative size-[28px] shrink-0 text-[#bcbcbc] hover:text-[#232222] md:size-[32px]"
          type="button"
        >
          <ChevronRight className="size-full" strokeWidth={1} />
        </button>
      </div>
    </div>

    <div className="flex flex-col gap-4 md:flex-row md:gap-[20px]">
      {CARDS.slice(0, 2).map((card) => (
        <div
          className={`w-full shrink-0 overflow-hidden rounded-[6px] p-4 md:w-[428px] md:p-[20px] ${
            card.variant === 'green' ? 'bg-[#c5ddcc]' : 'bg-[#fff0f6]'
          }`}
          key={card.id}
        >
          <div className="space-y-2">
            {card.variant === 'green' ? (
              <>
                <div className="text-[#007c23]">
                  <p className="font-medium font-sans text-[20px] leading-[0.96] tracking-[-0.4px] md:text-[24.9px] md:tracking-[-0.5px]">
                    One username
                  </p>
                  <p className="font-serif text-[20px] italic leading-[0.96] md:text-[24.9px]">
                    everywhere.
                  </p>
                </div>
                <p className="font-sans text-[#007c23] text-[13px] leading-[1.3] tracking-[-0.26px] md:text-[14px] md:leading-none md:tracking-[-0.28px]">
                  Your name lives onchain — you own it, not a platform. Sign in
                  to web3 apps with your{' '}
                  <span className="font-medium">.eth name</span> and your ENS
                  profile will load automatically.
                </p>
              </>
            ) : (
              <>
                <div className="text-[#f53293]">
                  <p className="font-medium font-sans text-[20px] leading-[0.96] tracking-[-0.4px] md:text-[24.9px] md:tracking-[-0.5px]">
                    Verify{' '}
                    <span className="font-serif italic">authenticity</span>
                  </p>
                  <p className="font-medium font-sans text-[20px] leading-[0.96] tracking-[-0.4px] md:text-[24.9px] md:tracking-[-0.5px]">
                    and stay safe.
                  </p>
                </div>
                <p className="font-sans text-[#f53293] text-[13px] leading-[1.3] tracking-[-0.26px] md:text-[14px] md:leading-none md:tracking-[-0.28px]">
                  Companies and projects use ENS because it's secured with
                  ethereum, so you can be sure it's the real deal. Avoid
                  impersonation scams and stay safe out there &lt;3.
                </p>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  </div>
)
