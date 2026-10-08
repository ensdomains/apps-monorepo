import { useQueries, useQuery } from '@tanstack/react-query'
import { type Address, isAddressEqual } from 'viem'
import { getNameRolesAccountsQueryOptions } from '@/features/roles/hooks/useNameRoleAccounts'
import { getNameRolesForAccountQueryOptions } from '@/features/roles/hooks/useNameRolesForAccount'
import { getRegistryRootRoleHoldersQueryOptions } from '@/features/roles/hooks/useRegistryRootRoleHolders'
import { getVersionedResourceQueryOptions } from '@/features/roles/hooks/useVersionedResource'
import { getLabel } from '@/utils/token/getLabel'
import type { TransferRoleRevocations } from '../types'
import { planRoleRevocations } from '../utils/planRoleRevocations'

/**
 * Who else can act on a V2 name through its registry roles, and which of those
 * grants the sender can revoke on the way out.
 *
 * Registry roles hang off `labelToCanonicalId(label)`, while ownership hangs off
 * the token id, so the two don't move together: a delegate added from the roles
 * page keeps `ROLE_SET_RESOLVER` over the name after it is sold. The transfer
 * form offers to revoke them, and needs this to know whether there is anything
 * to offer.
 *
 * Opted out of the app-wide one-hour staleTime: an hour-old "nobody else holds
 * roles" is exactly the answer that would hand a name over with a live grant
 * still attached, and the read gates a step the sender can't take afterwards.
 * The flip side is that a revisit refetches in the background while the cached
 * answer is still `isSuccess`, so a refetch in flight reports as `pending` —
 * the grants on screen are the previous answer and the plan must not be built
 * from them.
 */
export const useTransferRoleRevocations = ({
  name,
  registryAddress,
  owner,
}: {
  readonly name: string
  /** The registry the name's token lives in (its parent's subregistry). */
  readonly registryAddress: Address
  /** The current token owner, whose grants are theirs to keep. */
  readonly owner: Address
}): TransferRoleRevocations => {
  // getLabel normalises and can throw on a malformed name. A name we can't
  // parse is one whose grants we can't read — that is unknown, not none, so it
  // reports as an error rather than an empty answer.
  let label: string | null = null
  try {
    label = getLabel(name)
  } catch {}

  const resourceQuery = useQuery({
    ...getVersionedResourceQueryOptions({ name, registryAddress }),
    enabled: label !== null,
    staleTime: 0,
  })
  const resource = resourceQuery.data ?? null

  const [accountsQuery, ownerRolesQuery, rootHoldersQuery] = useQueries({
    queries: [
      {
        ...getNameRolesAccountsQueryOptions({ resource, registryAddress }),
        enabled: resource !== null,
        staleTime: 0,
      },
      {
        ...getNameRolesForAccountQueryOptions({
          registryAddress,
          label: label ?? '',
          account: owner,
        }),
        enabled: label !== null,
        staleTime: 0,
      },
      // `EnhancedAccessControl._effectiveRoles` ORs an account's root roles
      // with its per-resource ones, so a sender holding the admin role at the
      // registry root can revoke a grant its per-name bitmap says nothing
      // about. Read here rather than inferred, or a name in the sender's own
      // registry would report a revocable delegate as permanent.
      {
        ...getRegistryRootRoleHoldersQueryOptions({ registryAddress }),
        staleTime: 0,
      },
    ],
  })

  if (
    label === null ||
    resourceQuery.isError ||
    accountsQuery.isError ||
    ownerRolesQuery.isError ||
    rootHoldersQuery.isError
  )
    return { status: 'error' }

  // Keyed off the data being there, not off `!isLoading`: a query that hasn't
  // run (or has failed) also has `data === undefined`, which must not read as
  // "no grants". `isFetching` covers the revalidation case — see the note
  // above.
  if (
    resourceQuery.isFetching ||
    !accountsQuery.data ||
    !ownerRolesQuery.data ||
    !rootHoldersQuery.data ||
    accountsQuery.isFetching ||
    ownerRolesQuery.isFetching ||
    rootHoldersQuery.isFetching
  )
    return { status: 'pending' }

  return planRoleRevocations({
    accounts: accountsQuery.data,
    owner,
    ownerRoles: ownerRolesQuery.data.decoded ?? [],
    ownerRootRoles:
      rootHoldersQuery.data.find((holder) =>
        isAddressEqual(holder.account, owner),
      )?.roles ?? [],
  })
}
