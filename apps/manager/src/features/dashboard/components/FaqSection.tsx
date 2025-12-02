import { ArrowRight, CircleArrowDown } from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

const faqItems = [
  {
    question: 'How do subnames work?',
    answer:
      'Subnames are names created under your existing ENS name (e.g. sub.name.eth). You can create unlimited subnames and configure them individually.',
  },
  {
    question: 'Can I transfer my ENS name to another wallet?',
    answer:
      'Yes. From a name’s profile you can transfer ownership to another address at any time.',
  },
  {
    question:
      'What is the difference between ENS and traditional domain names?',
    answer:
      'ENS names are decentralized, owned by you on the blockchain, and can be used for payments, websites, and more. Traditional domains are rented from centralized registrars.',
  },
  {
    question: 'How can I secure my ENS name?',
    answer:
      'Use a secure wallet, be cautious of signing unknown transactions, and verify links before connecting. You can also lock your name’s records for added security.',
  },
]

export const FaqSection = () => (
  <div className="rounded-[8px] border-[#dededf] border-[0.25px] bg-white px-[24px] py-[32px]">
    <div className="mb-[12px] flex flex-col items-start gap-[12px]">
      <h2 className="font-serif text-[#232222] text-[28px] leading-[0.96] tracking-[0.28px]">
        Frequently Asked Questions
      </h2>
      <a
        href="https://para.com/support"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-[4.92px] text-[#0080bc] hover:text-[#006699]"
      >
        <span className="font-sans text-[14px] leading-[1.8]">Get support</span>
        <ArrowRight className="size-[8px]" strokeWidth={2} />
      </a>
    </div>
    <div className="flex flex-col">
      {faqItems.map(({ question, answer }) => (
        <Collapsible key={question}>
          <div className="border-[lightgrey] border-b-[0.4px] last:border-b-0">
            <CollapsibleTrigger className="flex h-[56px] w-full items-center justify-between text-left font-sans text-[#121212] text-[16px] leading-[20px]">
              <span>{question}</span>
              <CircleArrowDown
                className="size-[24px] text-[#232222]"
                strokeWidth={1}
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="pb-4 text-[#515151] text-[14px]">
              {answer}
            </CollapsibleContent>
          </div>
        </Collapsible>
      ))}
    </div>
  </div>
)
