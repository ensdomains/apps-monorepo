import { useQueries } from '@tanstack/react-query'
import { TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { EntityBadge } from '@/components/EntityBadge'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { SettingsMenu } from '@/components/SettingsMenu'
import { WalletMenu } from '@/components/WalletMenu'
import { cn } from '@/lib/utils'
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
  const plainDate = expiryDate ? dateToPlainDate(expiryDate) : undefined
  const duration = plainDate ? formatExpiryDuration(plainDate) : undefined
  const isWarning =
    !!plainDate &&
    Temporal.Now.plainDateISO().until(plainDate).days <= WARNING_DAYS

  return (
    <span
      className={cn(
        'shrink-0 whitespace-nowrap font-semi-mono text-sm',
        isWarning
          ? 'inline-flex h-6.25 items-center gap-1 rounded-xs bg-message-warning-fill px-2 text-message-warning-text'
          : 'text-neutral-7',
      )}
    >
      {isWarning && <TriangleAlert className="size-3.25" aria-hidden />}
      {match(duration)
        .with(undefined, () => 'Does not expire')
        .with('Expired', (expired) => expired)
        .otherwise((left) => `Expires in ${left}`)}
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
  const isSettled = !v1Query.isPending && !v2Query.isPending
  const hasError = Boolean(v1Query.error || v2Query.error)

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
      {v1Query.error && (
        <ErrorMessage
          compact
          description="Error fetching ENSv1 names. Please refresh the page."
        />
      )}
      {v2Query.error && (
        <ErrorMessage
          compact
          description="Error fetching ENSv2 names. Please refresh the page."
        />
      )}
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
      {isSettled && !hasError && names.length === 0 && (
        <p className="border-t border-neutral-3 py-3 text-sm text-neutral-7">
          No names yet
        </p>
      )}
    </div>
  )
}
