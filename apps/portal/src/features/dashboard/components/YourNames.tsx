import { useQuery } from '@tanstack/react-query'
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
import {
  type AddressNameItem,
  byResolvingExpiry,
  getResolvingExpiry,
} from '@/utils/names/addressNames'
import { unixSecondsToPlainDateUtc } from '@/utils/temporal'
import { getAddressNamesQueryOptions } from '../hooks/useAddressNames'

const INITIAL_COUNT = 4
const WARNING_DAYS = 30

const soonestToStop = (names: readonly AddressNameItem[]) =>
  names.toSorted(byResolvingExpiry)

const Expiry = (
  row: Pick<AddressNameItem, 'expiryDate' | 'parentExpiryDate'>,
) => {
  const resolving = getResolvingExpiry(row)
  const plainDate = resolving.date
    ? unixSecondsToPlainDateUtc(
        Math.floor(resolving.date.getTime() / MS_PER_SECOND),
      )
    : undefined
  // `plainDate` is the UTC expiry day, so compare it against the UTC today.
  const today = Temporal.Now.plainDateISO('UTC')
  const duration = plainDate
    ? formatExpiryDuration(plainDate, today)
    : undefined
  const isWarning = !!plainDate && today.until(plainDate).days <= WARNING_DAYS
  const isWithParent = !!plainDate && resolving.type !== 'own'

  return (
    <div className="flex shrink-0 flex-col items-start gap-0.5 sm:items-end">
      <span
        className={cn(
          'shrink-0 whitespace-nowrap text-entity-name font-normal',
          isWarning
            ? 'inline-flex h-6.25 items-center gap-1 rounded-xs bg-message-warning-fill px-2 text-message-warning-text'
            : 'text-neutral-7',
        )}
      >
        {isWarning && <TriangleAlert className="size-3.25" aria-hidden />}
        {match({ type: resolving.type, duration })
          .with(
            { type: 'parent', duration: undefined },
            () => 'Expires with parent',
          )
          .with({ duration: undefined }, () => 'Does not expire')
          .with(
            { type: 'parentFirst', duration: 'Expired' },
            () => 'Stopped resolving',
          )
          .with({ type: 'parentFirst' }, () => `Stops resolving in ${duration}`)
          .with({ duration: 'Expired' }, () => 'Expired')
          .otherwise(() => `Expires in ${duration}`)}
      </span>
      {isWithParent && (
        <span className="text-small text-neutral-7">With its parent</span>
      )}
    </div>
  )
}

export const YourNames = ({ address }: { readonly address: Address }) => {
  // Every name the wallet holds a relation to, granted subnames included,
  // soonest to stop resolving first. bigname serves the whole list, so it
  // pages locally.
  const namesQuery = useQuery({
    ...getAddressNamesQueryOptions({ address }),
    select: soonestToStop,
  })
  const names = namesQuery.data ?? []

  const loader = useListLoader({
    initialCount: INITIAL_COUNT,
    loaded: names.length,
    resetKey: address,
  })

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
      {namesQuery.isError && (
        <ErrorMessage
          compact
          description="Error fetching names. Please refresh the page."
        />
      )}
      {names.length > 0 && (
        <div>
          <ul>
            {names.slice(0, loader.shown).map(({ name, ...row }) =>
              name ? (
                <li
                  key={name}
                  className="flex flex-col items-start gap-4 border-t border-neutral-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <EntityBadge variant="name" name={name} showAvatar compact>
                    <span title={name}>{truncateName(name)}</span>
                  </EntityBadge>
                  <Expiry {...row} />
                </li>
              ) : null,
            )}
          </ul>
          <ListLoader {...loader} className="border-t border-neutral-3 py-3" />
        </div>
      )}
      {namesQuery.isPending && <LoadingSpinner title="Loading your names" />}
      {namesQuery.isSuccess && names.length === 0 && (
        <p className="border-t border-neutral-3 py-3 text-p text-neutral-7">
          No names yet
        </p>
      )}
    </div>
  )
}
