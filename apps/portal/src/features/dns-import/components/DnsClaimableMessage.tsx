import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { BadgeCheck } from 'lucide-react'
import type { Address } from 'viem'
import { AvailableNameMessage } from '@/components/AvailableNameMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { MessageCard } from '@/components/ui/message-card'
import { getTLD } from '@/utils/ens/tldHelpers'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import { getDnsOffchainStatusQueryOptions } from '../queries/getDnsOffchainStatus'
import { getDnsTldStatusQueryOptions } from '../queries/getDnsTldStatus'
import { CustomTldMessage } from './CustomTldMessage'

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
    />
  )
}

/**
 * Overview-page message for a DNS 2LD with no registry entry: the import CTA
 * for standard TLDs, the custom-integration notice for TLDs whose operator
 * claimed the TLD node (importing there never applies), or — when the name
 * already resolves gaslessly — the off-chain notice.
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
  // Errors here are the expected "no ENS1 record" case (the underlying read is
  // strict), which simply means the name isn't live off-chain — fall through
  // to the import CTA rather than surfacing a failure.
  const offchainQuery = useQuery(getDnsOffchainStatusQueryOptions({ name }))

  if (tldStatusQuery.isLoading || offchainQuery.isLoading) {
    return <LoadingSpinner title="Checking availability..." />
  }

  if (tldStatusQuery.data?.type === 'custom') {
    return <CustomTldMessage tld={tld} />
  }

  const resolvedAddress = offchainQuery.data?.resolvedAddress
  if (resolvedAddress) {
    return <DnsOffchainNameMessage name={name} address={resolvedAddress} />
  }

  return (
    <AvailableNameMessage
      name={name}
      description={
        <p>
          This DNS name can be imported to ENS — free off-chain, or onchain with
          a token.
        </p>
      }
      actionButton={{
        label: 'Import name',
        onClick: () =>
          void navigate({
            to: '/import/$name',
            params: { name },
            search: { type: 'offchain', step: 'start' },
          }),
      }}
    />
  )
}
