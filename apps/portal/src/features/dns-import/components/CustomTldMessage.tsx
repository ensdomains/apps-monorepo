import { CircleAlert } from 'lucide-react'
import { MessageCard } from '@/components/ui/message-card'

const TLD_DOCS_URL = 'https://docs.ens.domains/dns/tlds/'

/**
 * Shown instead of the import flow/CTA for TLDs whose operator claimed the
 * TLD node in the registry (`.art`, `.box`, `.hiphop`, …): the standard
 * import paths don't apply there — the operator's own registrar controls how
 * names under it reach ENS.
 */
export const CustomTldMessage = ({ tld }: { readonly tld: string }) => (
  <MessageCard
    variant="warning"
    icon={<CircleAlert className="size-6" strokeWidth={1.5} />}
    title={`.${tld} names can't be imported here`}
    description={
      <p>
        The <strong>.{tld}</strong> registry runs its own ENS integration
        instead of the standard DNS import, so names under it are claimed
        through the <strong>.{tld}</strong> registry directly.
      </p>
    }
    actionButton={{
      label: 'Learn more',
      href: TLD_DOCS_URL,
      external: true,
    }}
  />
)
