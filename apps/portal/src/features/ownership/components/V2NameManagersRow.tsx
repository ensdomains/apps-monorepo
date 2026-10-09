import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { type Address, isAddressEqual } from 'viem'
import { ShieldPersonIcon } from '@/assets/icons'
import { AddressDisplay } from '@/components/table/EventsDataTable/AddressDisplay'
import { InfoRow } from '@/features/profile/components/InfoRow'
import { getNameRolesAccountsQueryOptions } from '@/features/roles/hooks/useNameRoleAccounts'
import { getVersionedResourceQueryOptions } from '@/features/roles/hooks/useVersionedResource'
import { formatRoleLabel } from '@/lib/roles/formatRoleLabel'
import { cn } from '@/lib/utils'

/**
 * The V2 counterpart of the V1 "Manager" row: the accounts that can act on this
 * name without holding it.
 *
 * V1 has one such slot, so the v1 page names it. V2 has any number of them —
 * registry roles are granted per account on the name's own EAC resource — and
 * they are keyed on the label rather than the token, so they survive a
 * transfer. Left off the page, a buyer has no way to notice that a seller's
 * delegate still holds `ROLE_SET_RESOLVER` over the name they just bought.
 *
 * Roles held at the registry root are not listed: they apply to every name in
 * the registry rather than to this one, and the roles page reports them
 * separately under its own heading.
 */
export const V2NameManagersRow = ({
  name,
  registryAddress,
  owner,
  className,
}: {
  readonly name: string
  readonly registryAddress: Address
  /** The token holder, whose own grants aren't a third party's. */
  readonly owner: Address
  readonly className?: string
}) => {
  const {
    data: resource = null,
    isLoading: isReadingId,
    error: readIdError,
  } = useQuery({
    ...getVersionedResourceQueryOptions({ name, registryAddress }),
    staleTime: 0,
  })

  const { data, isLoading, error } = useQuery({
    ...getNameRolesAccountsQueryOptions({ resource, registryAddress }),
    enabled: resource !== null,
    // Opted out of the app-wide one-hour staleTime: this row exists to disclose
    // a live write authority over the name, and an hour-old "nobody" is exactly
    // the answer that would keep hiding a grant made since.
    staleTime: 0,
  })

  const row = (children: ReactNode) => (
    <InfoRow icon={ShieldPersonIcon} label="Managers" className={className}>
      {children}
    </InfoRow>
  )

  if (isReadingId || isLoading)
    return row(<span className="text-sm text-muted-foreground">Loading</span>)

  // Unknown, not none — on both branches. Silence here would reproduce exactly
  // the gap this row exists to close, so say the check didn't land.
  if (readIdError || error)
    return row(
      <span className="text-sm text-muted-foreground">
        Couldn’t check who else holds permissions on this name
      </span>,
    )

  if (!data)
    return row(
      <span className="text-sm text-muted-foreground">
        No permissions data for this name
      </span>,
    )

  const holders = [...data.holders].filter(
    ([account, roles]) => roles.length > 0 && !isAddressEqual(account, owner),
  )

  if (holders.length === 0 && !data.isVerified)
    return row(
      <span className="text-sm text-muted-foreground">
        Couldn’t check who else holds permissions on this name
      </span>,
    )

  if (holders.length === 0) return null

  return (
    // Auto-height rather than the row's fixed `sm:h-10`: one line per holder.
    <InfoRow
      icon={ShieldPersonIcon}
      label="Managers"
      className={cn('sm:h-auto sm:items-start sm:py-2', className)}
    >
      <ul className="flex flex-col gap-2">
        {holders.map(([account, roles]) => (
          <li key={account} className="flex flex-col gap-0.5">
            <AddressDisplay address={account} />
            <span className="text-muted-foreground text-sm">
              {roles.map(formatRoleLabel).join(', ')} ·{' '}
              <Link
                to="/$name/roles"
                params={{ name }}
                className="underline underline-offset-2"
              >
                Manage
              </Link>
            </span>
          </li>
        ))}
      </ul>
    </InfoRow>
  )
}
