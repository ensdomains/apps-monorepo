import { ChevronLeft, ChevronRight } from 'lucide-react'

const CARDS = Array.from({ length: 10 }).map((_, i) => ({
  id: i,
  variant: i % 2 === 0 ? 'green' : 'pink',
}))

export const DidYouKnowSection = () => (
  <div className="rounded-[8px] border-[#dededf] border-[0.25px] bg-white px-[24px] py-[32px]">
    <div className="mb-[32px] flex items-center justify-between">
      <h2 className="font-serif text-[#232222] text-[28px] leading-[0.96] tracking-[0.28px]">
        Did You Know?
      </h2>

      <div className="flex items-center gap-[8px]">
        <button
          type="button"
          className="size-[32px] text-[#bcbcbc] hover:text-[#232222]"
        >
          <ChevronLeft className="size-full" strokeWidth={1} />
        </button>
        <span className="font-sans text-[#7d7d7d] text-[12px] tracking-[0.12px]">
          1 of 10
        </span>
        <button
          type="button"
          className="size-[32px] text-[#bcbcbc] hover:text-[#232222]"
        >
          <ChevronRight className="size-full" strokeWidth={1} />
        </button>
      </div>
    </div>

    <div className="scrollbar-hide flex gap-[20px] overflow-x-auto pb-2">
      {CARDS.map((card) => (
        <div
          key={card.id}
          className={`w-[428px] shrink-0 overflow-hidden rounded-[6px] p-[20px] ${
            card.variant === 'green' ? 'bg-[#c5ddcc]' : 'bg-[#fff0f6]'
          }`}
        >
          <div className="space-y-2">
            {card.variant === 'green' ? (
              <>
                <div className="text-[#007c23]">
                  <p className="font-medium font-sans text-[24.9px] leading-[0.96] tracking-[-0.5px]">
                    One username
                  </p>
                  <p className="font-serif text-[24.9px] italic leading-[0.96]">
                    everywhere.
                  </p>
                </div>
                <p className="font-sans text-[#007c23] text-[14px] leading-none tracking-[-0.28px]">
                  Your name lives onchain — you own it, not a platform. Sign in
                  to web3 apps with your{' '}
                  <span className="font-medium">.eth name</span> and your ENS
                  profile will load automatically.
                </p>
              </>
            ) : (
              <>
                <div className="text-[#f53293]">
                  <p className="font-medium font-sans text-[24.9px] leading-[0.96] tracking-[-0.5px]">
                    Verify{' '}
                    <span className="font-serif italic">authenticity</span>
                  </p>
                  <p className="font-medium font-sans text-[24.9px] leading-[0.96] tracking-[-0.5px]">
                    and stay safe.
                  </p>
                </div>
                <p className="font-sans text-[#f53293] text-[14px] leading-none tracking-[-0.28px]">
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
