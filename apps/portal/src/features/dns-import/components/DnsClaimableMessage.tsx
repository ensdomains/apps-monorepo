import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { AvailableNameMessage } from '@/components/AvailableNameMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { getTLD } from '@/utils/ens/tldHelpers'
import { getDnsTldStatusQueryOptions } from '../queries/getDnsTldStatus'
import { CustomTldMessage } from './CustomTldMessage'

/**
 * Overview-page message for an unowned DNS 2LD: the import CTA for standard
 * TLDs, or the custom-integration notice for TLDs whose operator claimed the
 * TLD node (importing there never applies).
 */
export const DnsClaimableMessage = ({ name }: { readonly name: string }) => {
  const navigate = useNavigate()
  const tld = getTLD(name)
  const tldStatusQuery = useQuery(getDnsTldStatusQueryOptions({ tld }))

  if (tldStatusQuery.isLoading) {
    return <LoadingSpinner title="Checking availability..." />
  }

  if (tldStatusQuery.data?.type === 'custom') {
    return <CustomTldMessage tld={tld} />
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
