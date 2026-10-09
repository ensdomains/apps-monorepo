import { TriangleAlert } from 'lucide-react'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { EntityBadge } from '@/components/EntityBadge'
import { ErrorMessage } from '@/components/ErrorMessage'
import { ListLoader } from '@/components/ListLoader/ListLoader'
import { useListLoader } from '@/components/ListLoader/useListLoader'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { SettingsMenu } from '@/components/SettingsMenu'
import { WalletMenu } from '@/components/WalletMenu'
import { MS_PER_SECOND } from '@/features/renew/utils/nameExtension'
import { cn } from '@/lib/utils'
import { formatExpiryDuration } from '@/utils/formatting/formatDateTime'
import { truncateName } from '@/utils/formatting/truncateName'
import { unixSecondsToPlainDateUtc } from '@/utils/temporal'
import { useOwnedNames } from '../hooks/useOwnedNames'

const INITIAL_COUNT = 4
const WARNING_DAYS = 30

const Expiry = ({ expiryDate }: { readonly expiryDate?: Date | null }) => {
  const plainDate = expiryDate
    ? unixSecondsToPlainDateUtc(
        Math.floor(expiryDate.getTime() / MS_PER_SECOND),
      )
    : undefined
  // `plainDate` is the UTC expiry day, so compare it against the UTC today.
  const today = Temporal.Now.plainDateISO('UTC')
  const duration = plainDate
    ? formatExpiryDuration(plainDate, today)
    : undefined
  const isWarning = !!plainDate && today.until(plainDate).days <= WARNING_DAYS

  return (
    <span
      className={cn(
        'shrink-0 whitespace-nowrap text-entity-name',
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
  // Every name the wallet owns, granted subnames included, soonest expiry first.
  const { names, total, hasMore, fetchMore, v1Query, v2Query } = useOwnedNames({
    address,
  })

  const loader = useListLoader({
    initialCount: INITIAL_COUNT,
    loaded: names.length,
    total,
    hasMore,
    fetchMore,
    resetKey: address,
  })

  // Each source reports its own state, so a slow or failed one never hides
  // the names the other already returned.
  const isSettled = !v1Query.isPending && !v2Query.isPending
  const hasV1Error = v1Query.isError && !v1Query.isFetchNextPageError
  const hasV2Error = v2Query.isError && !v2Query.isFetchNextPageError
  const hasError = hasV1Error || hasV2Error

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
      {hasV1Error && (
        <ErrorMessage
          compact
          description="Error fetching ENSv1 names. Please refresh the page."
        />
      )}
      {hasV2Error && (
        <ErrorMessage
          compact
          description="Error fetching ENSv2 names. Please refresh the page."
        />
      )}
      {(names.length > 0 || hasMore) && (
        <div>
          <ul>
            {names.slice(0, loader.shown).map(({ name, expiryDate }) =>
              name ? (
                <li
                  key={name}
                  className="flex flex-col items-start gap-4 border-t border-neutral-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <EntityBadge variant="name" name={name} showAvatar compact>
                    <span title={name}>{truncateName(name)}</span>
                  </EntityBadge>
                  <Expiry expiryDate={expiryDate} />
                </li>
              ) : null,
            )}
          </ul>
          <ListLoader {...loader} className="border-t border-neutral-3 py-3" />
        </div>
      )}
      {!isSettled && <LoadingSpinner title="Loading your names" />}
      {isSettled && !hasError && names.length === 0 && !hasMore && (
        <p className="border-t border-neutral-3 py-3 text-p text-neutral-7">
          No names yet
        </p>
      )}
    </div>
  )
}
