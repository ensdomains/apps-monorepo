import { ArrowRight, CircleArrowDown } from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import * as m from '@/paraglide/messages.js'

export const FaqSection = () => {
  const faqItems = [
    {
      question: m.faqItemsSendCryptoQuestion(),
      answer: m.faqItemsSendCryptoAnswer(),
    },
    {
      question: m.faqItemsShowNameQuestion(),
      answer: m.faqItemsShowNameAnswer(),
    },
    {
      question: m.faqItemsChangePrimaryLaterQuestion(),
      answer: m.faqItemsChangePrimaryLaterAnswer(),
    },
    {
      question: m.faqItemsSecureNameQuestion(),
      answer: m.faqItemsSecureNameAnswer(),
    },
  ]

  return (
    <div className="border-[0.25px] border-border bg-white px-4 py-6 md:rounded-lg md:px-6 md:py-8">
      <div className="mb-3 flex flex-col items-start gap-3 md:gap-3">
        <h2 className="font-serif text-[24px] text-foreground leading-[0.96] tracking-[0.24px] md:text-[28px] md:tracking-[0.28px]">
          {m.faqTitle()}
        </h2>
        <a
          className="flex items-center gap-[4.92px] text-ens-blue hover:text-ens-blue-hover"
          href="https://support.ens.domains"
          rel="noopener noreferrer"
          target="_blank"
        >
          <span className="font-sans text-[13px] leading-[1.6] md:text-sm md:leading-[1.8]">
            {m.faqGetSupport()}
          </span>
          <ArrowRight className="size-[7px] md:size-2" strokeWidth={2} />
        </a>
      </div>
      <div className="flex flex-col">
        {faqItems.map(({ question, answer }) => (
          <Collapsible key={question}>
            <div className="border-ens-gray-two border-b-[0.4px] last:border-b-0">
              <CollapsibleTrigger className="group flex h-14 w-full items-center justify-between text-left font-sans text-[16px] text-foreground leading-[20px] md:text-[20px] md:leading-[22px]">
                <span>{question}</span>
                <CircleArrowDown
                  className="size-6 text-foreground transition-transform duration-200 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] group-data-[state=open]:rotate-180 motion-reduce:transition-none"
                  strokeWidth={1}
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="overflow-hidden pb-4 text-muted-foreground text-sm data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down motion-reduce:animate-none">
                {answer}
              </CollapsibleContent>
            </div>
          </Collapsible>
        ))}
      </div>
    </div>
  )
}
