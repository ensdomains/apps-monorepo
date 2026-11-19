import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { BadgeCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Address } from 'viem'
import { AvailableNameMessage } from '@/components/AvailableNameMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { MessageCard } from '@/components/ui/message-card'
import { getTLD } from '@/utils/ens/tldHelpers'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import { useDnsOffchainName } from '../hooks/useDnsOffchainName'
import { getDnsTldStatusQueryOptions } from '../queries/getDnsTldStatus'
import { CustomTldMessage } from './CustomTldMessage'

/**
 * Matches the import form these cards lead into (`DnsImportFlow`): same
 * 576px column, same top offset, so the hand-off doesn't shift the content.
 */
const IMPORT_COLUMN_CLASS = 'max-w-xl mt-6'

/** The record's parts, highlighted the way the design calls them out. */
const InlineCode = ({ children }: { readonly children: ReactNode }) => (
  <code className="rounded-sm bg-current/10 px-1 text-entity-base">
    {children}
  </code>
)

/**
 * Shown for a DNS name that is already live through the gasless path. It has
 * no registry entry — that's what gasless means — so the only thing left to
 * offer is the onchain import, which adds one (plus a token).
 */
const DnsOffchainNameMessage = ({
  name,
  address,
}: {
  readonly name: string
  readonly address: Address
}) => {
  const navigate = useNavigate()
  return (
    <MessageCard
      variant="success"
      icon={<BadgeCheck size={24} strokeWidth={1.5} />}
      title={`${name} resolves off-chain`}
      description={
        <p>
          This DNS name is already active in ENS through its{' '}
          <strong>ENS1</strong> TXT record, resolving to{' '}
          <span className="font-mono">{truncateAddress(address)}</span>. It has
          no registry entry — importing it onchain adds one, along with a token.
        </p>
      }
      actionButton={{
        label: 'Import onchain',
        onClick: () =>
          void navigate({
            to: '/import/$name',
            params: { name },
            search: { type: 'onchain', step: 'start' },
          }),
      }}
      className={IMPORT_COLUMN_CLASS}
    />
  )
}

/**
 * Message for a DNS 2LD with no registry entry, shown on the overview and on
 * every `/$name` tab that has no registry data to show: the import CTA for
 * standard TLDs, the custom-integration notice for TLDs whose operator claimed
 * the TLD node (importing there never applies), or — when the name already
 * resolves gaslessly — the off-chain notice.
 *
 * The off-chain check matters because a gasless name has no registry entry by
 * design, so the page's owner lookup returns null for a name that is perfectly
 * live. Without it, finishing the gasless import navigates back to `/$name`
 * and lands on a CTA offering to import the name that was just imported.
 */
export const DnsClaimableMessage = ({ name }: { readonly name: string }) => {
  const navigate = useNavigate()
  const tld = getTLD(name)
  const tldStatusQuery = useQuery(getDnsTldStatusQueryOptions({ tld }))
  // Only ever rendered for a name with no registry entry. One that isn't live
  // off-chain either falls through to the import CTA.
  const offchain = useDnsOffchainName({ name, owner: null })

  if (tldStatusQuery.isLoading || offchain.isLoading) {
    return <LoadingSpinner title="Checking availability..." />
  }

  if (tldStatusQuery.data?.type === 'custom') {
    return <CustomTldMessage tld={tld} />
  }

  const { resolvedAddress } = offchain
  if (resolvedAddress) {
    return <DnsOffchainNameMessage name={name} address={resolvedAddress} />
  }

  return (
    <AvailableNameMessage
      name={name}
      description={
        // Both prerequisites are stated up front: they are set in the same DNS
        // manager, so a user who learns about them one step at a time makes two
        // trips to their provider.
        <p>
          This domain can be imported into ENS and used like a .eth name. First,
          enable DNSSEC with your DNS provider. Then add a TXT record named{' '}
          <InlineCode>_ens</InlineCode> with the value{' '}
          <InlineCode>a=&lt;your address&gt;</InlineCode> using an Ethereum
          address you control. Sign a transaction to verify. Once imported, the
          owner can set ENS records for {name}, such as an ETH address to
          receive funds.
        </p>
      }
      actionButton={{
        label: 'Import name',
        onClick: () =>
          // The description above is the onchain record (`_ens`, a signing
          // step, editable records afterwards), so that's the route this
          // preselects — the next screen still lets them switch to offchain.
          void navigate({
            to: '/import/$name',
            params: { name },
            search: { type: 'onchain', step: 'start' },
          }),
      }}
      className={IMPORT_COLUMN_CLASS}
    />
  )
}
