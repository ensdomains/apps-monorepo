import { useQueries } from '@tanstack/react-query'
import { TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import type { Address } from 'viem'
import { EntityBadge } from '@/components/EntityBadge'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { SettingsMenu } from '@/components/SettingsMenu'
import { WalletMenu } from '@/components/WalletMenu'
import { formatExpiryDuration } from '@/utils/formatting/formatDateTime'
import { truncateName } from '@/utils/formatting/truncateName'
import { mergeNamesData } from '@/utils/names/mergeNamesData'
import { dateToPlainDate } from '@/utils/temporal'
import { getV1NamesForAddressQueryOptions } from '../hooks/useV1NamesForAddress'
import { getV2NamesWithRolesForAddressQueryOptions } from '../hooks/useV2NamesWithRolesForAddress'

const INITIAL_COUNT = 4
const PAGE_SIZE = 10
const WARNING_DAYS = 30

const Expiry = ({ expiryDate }: { readonly expiryDate?: Date | null }) => {
  if (!expiryDate) {
    return (
      <span className="shrink-0 whitespace-nowrap font-semi-mono text-sm text-neutral-7">
        Does not expire
      </span>
    )
  }
  const plainDate = dateToPlainDate(expiryDate)
  const duration = formatExpiryDuration(plainDate)
  const label = duration === 'Expired' ? duration : `Expires in ${duration}`
  const daysLeft = Temporal.Now.plainDateISO().until(plainDate).days

  return daysLeft > WARNING_DAYS ? (
    <span className="shrink-0 whitespace-nowrap font-semi-mono text-sm text-neutral-7">
      {label}
    </span>
  ) : (
    <span className="inline-flex h-6.25 shrink-0 items-center whitespace-nowrap gap-1 rounded-xs bg-message-warning-fill px-2 font-semi-mono text-sm text-message-warning-text">
      <TriangleAlert className="size-3.25" aria-hidden />
      {label}
    </span>
  )
}

export const YourNames = ({ address }: { readonly address: Address }) => {
  const [visibleCount, setVisibleCount] = useState(INITIAL_COUNT)
  const [v1Query, v2Query] = useQueries({
    queries: [
      getV1NamesForAddressQueryOptions({ address }),
      getV2NamesWithRolesForAddressQueryOptions({ address }),
    ],
  })

  // Every name the wallet owns, granted subnames included, soonest expiry first.
  const names = mergeNamesData(v1Query.data, v2Query.data)

  // Each source reports its own state, so a slow or failed one never hides
  // the names the other already returned.
  const sources = [
    { label: 'ENSv1', query: v1Query },
    { label: 'ENSv2', query: v2Query },
  ]
  const isSettled = sources.every(({ query }) => !query.isPending)
  const failed = sources.filter(({ query }) => query.error)

  return (
    <div className="flex flex-col gap-6 rounded-md border border-neutral-3 px-6 pt-6 pb-3">
      <div className="flex flex-col-reverse gap-6 sm:flex-row sm:items-center">
        <h2 className="text-caps flex-1 text-neutral-9">Your names</h2>
        <div className="flex items-center justify-between gap-3">
          <SettingsMenu
            side="bottom"
            className="size-7.5 rounded-xs bg-neutral-2 text-neutral-7 hover:bg-neutral-3 [&_svg]:size-5"
          />
          <WalletMenu isPill />
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
                className="flex flex-col items-start gap-4 border-t border-neutral-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <EntityBadge variant="name" name={name} showAvatar compact>
                  {truncateName(name)}
                </EntityBadge>
                <Expiry expiryDate={expiryDate} />
              </li>
            ) : null,
          )}
          {names.length > visibleCount && (
            <li className="border-t border-neutral-3 py-3">
              <button
                type="button"
                onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                className="cursor-pointer font-semi-mono text-sm text-neutral-7 hover:underline"
              >
                Show more ({names.length} total)
              </button>
            </li>
          )}
        </ul>
      )}
      {!isSettled && <LoadingSpinner title="Loading your names" />}
      {isSettled && failed.length === 0 && names.length === 0 && (
        <p className="border-t border-neutral-3 py-3 text-sm text-neutral-7">
          No names yet
        </p>
      )}
    </div>
  )
}
