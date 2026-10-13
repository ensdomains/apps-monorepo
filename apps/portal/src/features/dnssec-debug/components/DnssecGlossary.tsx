import { ChevronRight } from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

const TERMS: readonly { readonly term: string; readonly meaning: string }[] = [
  {
    term: 'Chain of trust',
    meaning:
      'DNSSEC trust flows down from the root: each zone vouches for its child with a DS record, and the child proves itself with keys matching it. One broken link breaks everything below.',
  },
  {
    term: 'DS record',
    meaning:
      "Published in the parent zone (for your domain, by your registrar). It holds a digest of the child zone's key-signing key.",
  },
  {
    term: 'DNSKEY',
    meaning:
      "A zone's public keys. Key-signing keys (KSK) sign the key set itself; zone-signing keys (ZSK) sign everything else.",
  },
  {
    term: 'RRSIG',
    meaning:
      'A signature over a set of records, valid between an inception and an expiration time. Expired signatures are a common cause of breakage.',
  },
  {
    term: 'ENS records',
    meaning:
      'ENS reads a TXT record "a=<address>" at _ens.<name> for onchain imports, or "ENS1 <resolver> <address>" at <name> for gasless names.',
  },
  {
    term: 'ENS oracle',
    meaning:
      'The DNSSECImpl contract that verifies the chain onchain. It supports fewer algorithms than resolvers do, so a chain can validate in DNS and still be rejected onchain.',
  },
  {
    term: 'Resolver caching',
    meaning:
      'Resolvers cache answers for up to their TTL, so recent DNS changes can take a while to show up. Compare resolvers if a result looks stale.',
  },
]

export const DnssecGlossary = () => (
  <Collapsible className="group/glossary rounded-xl border p-6">
    <CollapsibleTrigger className="flex w-full items-center gap-2 text-left font-medium cursor-pointer">
      <ChevronRight className="size-4 transition-transform group-data-[state=open]/glossary:rotate-90" />
      What do these checks mean?
    </CollapsibleTrigger>
    <CollapsibleContent>
      <dl className="mt-4 flex flex-col gap-3">
        {TERMS.map(({ term, meaning }) => (
          <div key={term} className="flex flex-col gap-0.5">
            <dt className="text-base font-medium">{term}</dt>
            <dd className="text-p text-muted-foreground">{meaning}</dd>
          </div>
        ))}
      </dl>
    </CollapsibleContent>
  </Collapsible>
)
