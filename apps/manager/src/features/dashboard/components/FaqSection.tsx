import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

const faqItems = [
  {
    question: 'How do I renew a name?',
    answer:
      'Go to Manage renewals to see upcoming expiries and extend your names before they lapse.',
  },
  {
    question: 'Can I transfer my ENS name?',
    answer:
      'Yes. From a name’s profile you can transfer ownership to another address at any time.',
  },
  {
    question: 'What is a primary name?',
    answer:
      'A primary name is the main ENS name attached to your wallet address. Apps can display it instead of your address.',
  },
  {
    question: 'Can I use ENS across chains?',
    answer:
      'ENS names are registered on Ethereum mainnet but can be used as identities across many ecosystems.',
  },
  {
    question: 'How can I keep my ENS names safe?',
    answer:
      'Use a secure wallet, be cautious of signing unknown transactions, and verify links before connecting.',
  },
]

export const FaqSection = () => (
  <Card className="border bg-white/90">
    <CardHeader>
      <CardTitle className="font-semibold font-serif text-lg">
        Frequently Asked Questions
      </CardTitle>
      <CardDescription>
        Quick answers to common questions about managing your ENS names.
      </CardDescription>
    </CardHeader>
    <CardContent className="space-y-1">
      {faqItems.map(({ question, answer }) => (
        <Collapsible key={question}>
          <div className="border-t first:border-t-0">
            <CollapsibleTrigger className="flex w-full items-center justify-between px-1 py-3 text-left font-medium text-sm">
              <span>{question}</span>
              <span className="ml-4 text-muted-foreground text-xs">+</span>
            </CollapsibleTrigger>
            <CollapsibleContent className="px-1 pb-3 text-muted-foreground text-sm">
              {answer}
            </CollapsibleContent>
          </div>
        </Collapsible>
      ))}
    </CardContent>
  </Card>
)
