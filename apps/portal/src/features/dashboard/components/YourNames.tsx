import { useQueries } from '@tanstack/react-query'
import { TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import type { Address } from 'viem'
import { EntityBadge } from '@/components/EntityBadge'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { SettingsMenu } from '@/components/SettingsMenu'
import { WalletMenu } from '@/components/WalletMenu'
import { partitionOwnedNames } from '@/features/address/nameAttribution'
import { formatExpiryDuration } from '@/utils/formatting/formatDateTime'
import { mergeNamesData } from '@/utils/names/mergeNamesData'
import { dateToPlainDate } from '@/utils/temporal'
import { getV1NamesForAddressQueryOptions } from '../hooks/useV1NamesForAddress'
import { getV2NamesWithRolesForAddressQueryOptions } from '../hooks/useV2NamesWithRolesForAddress'

const INITIAL_COUNT = 4
const PAGE_SIZE = 10
const WARNING_DAYS = 30

const Expiry = ({ expiryDate }: { expiryDate?: Date | null }) => {
  if (!expiryDate) {
    return (
      <span className="text-sm text-muted-foreground">Does not expire</span>
    )
  }
  const plainDate = dateToPlainDate(expiryDate)
  const duration = formatExpiryDuration(plainDate)
  const label = duration === 'Expired' ? duration : `Expires in ${duration}`
  const daysLeft = Temporal.Now.plainDateISO().until(plainDate).days

  return daysLeft > WARNING_DAYS ? (
    <span className="font-semi-mono text-sm text-muted-foreground">
      {label}
    </span>
  ) : (
    <span className="inline-flex h-6.25 items-center gap-1 rounded-sm bg-message-warning-fill px-2 font-semi-mono text-sm text-message-warning-text">
      <TriangleAlert className="size-3.25" aria-hidden />
      {label}
    </span>
  )
}

export const YourNames = ({ address }: { address: Address }) => {
  const [visibleCount, setVisibleCount] = useState(INITIAL_COUNT)
  const [v1Query, v2Query] = useQueries({
    queries: [
      getV1NamesForAddressQueryOptions({ address }),
      getV2NamesWithRolesForAddressQueryOptions({ address }),
    ],
  })

  // Names a parent granted the wallet are still its names; they just follow
  // the ones it holds or minted itself.
  const { acquired, assigned } = partitionOwnedNames(
    mergeNamesData(v1Query.data, v2Query.data),
  )
  const names = [...acquired, ...assigned]

  // Each source reports its own state, so a slow or failed one never hides
  // the names the other already returned.
  const sources = [
    { label: 'ENSv1', query: v1Query },
    { label: 'ENSv2', query: v2Query },
  ]
  const isSettled = sources.every(({ query }) => !query.isLoading)
  const failed = sources.filter(({ query }) => query.error)

  return (
    <div className="flex flex-col gap-6 rounded-lg border border-border px-6 pt-6 pb-3">
      <div className="flex flex-col-reverse gap-6 sm:flex-row sm:items-center">
        <h2 className="text-caps flex-1">Your names</h2>
        <div className="flex items-center justify-between gap-3">
          <SettingsMenu side="bottom" />
          <WalletMenu />
        </div>
      </div>
      {failed.map(({ label }) => (
        <ErrorMessage
          key={label}
          compact
          description={`Error fetching ${label} names. Please refresh the page.`}
        />
      ))}
      {names.length > 0 && (
        <ul>
          {names.slice(0, visibleCount).map(({ name, expiryDate }) =>
            name ? (
              <li
                key={name}
                className="flex flex-col items-start gap-4 border-t border-border py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <EntityBadge variant="name" name={name} showAvatar compact>
                  {name}
                </EntityBadge>
                <Expiry expiryDate={expiryDate} />
              </li>
            ) : null,
          )}
          {names.length > visibleCount && (
            <li className="border-t border-border py-3">
              <button
                type="button"
                onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                className="cursor-pointer font-semi-mono text-sm text-muted-foreground hover:underline"
              >
                Show more ({names.length} total)
              </button>
            </li>
          )}
        </ul>
      )}
      {!isSettled && <LoadingSpinner title="Loading your names" />}
      {isSettled && failed.length === 0 && names.length === 0 && (
        <p className="border-t border-border py-3 text-sm text-muted-foreground">
          No names yet
        </p>
      )}
    </div>
  )
}
