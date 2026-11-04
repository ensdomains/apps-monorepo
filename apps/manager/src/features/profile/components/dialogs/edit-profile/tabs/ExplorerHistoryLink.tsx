import { Trans, useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { chain } from '@/config'
import { formatProfileDetailDate } from '@/features/profile/components/view/ProfileView.helpers'
import { getProfileCreationQueryOptions } from '@/features/profile/service/profileCreation'
import { truncateAddress } from '@/lib/utils'
import { ExplorerEntityLink } from './ExplorerEntityLink'

export const ExplorerHistoryLink = ({
  name,
  href,
}: {
  readonly name: string
  readonly href: string
}) => {
  const { t } = useLingui()
  const { data: creation } = useQuery(getProfileCreationQueryOptions({ name }))

  if (!creation) {
    return (
      <p>
        <Trans>
          View the detailed history of this name in Explorer.{' '}
          <a
            className="rounded-sm underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2"
            href={href}
            rel="noopener noreferrer"
            target="_blank"
          >
            View history
          </a>
        </Trans>
      </p>
    )
  }

  return (
    <div>
      <Trans>
        View the detailed history going back to when this name was created on{' '}
        <ExplorerEntityLink
          actions={
            <>
              <Button asChild size="sm" variant="outline">
                <a href={href} rel="noopener noreferrer" target="_blank">
                  <Trans>View history</Trans>
                </a>
              </Button>
              <Button asChild size="sm" variant="outline">
                <a
                  href={`${chain.blockExplorers.default.url}/tx/${creation.transactionHash}`}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <ArrowUpRight aria-hidden className="size-4" />
                  <Trans>Etherscan</Trans>
                </a>
              </Button>
            </>
          }
          actionsLabel={t`Transaction actions`}
          className="bg-ens-citrine-50 text-ens-citrine-500"
          href={href}
        >
          <time
            className="whitespace-nowrap rounded-xs bg-white px-1"
            dateTime={creation.createdAt.toISOString()}
          >
            {formatProfileDetailDate(creation.createdAt)}
          </time>
          <span className="font-mono">
            {truncateAddress(creation.transactionHash)}
          </span>
        </ExplorerEntityLink>
      </Trans>
    </div>
  )
}
