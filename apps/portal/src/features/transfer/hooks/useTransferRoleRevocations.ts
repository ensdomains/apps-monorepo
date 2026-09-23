import { useQueries } from '@tanstack/react-query'
import type { Address } from 'viem'
import { getNameRolesAccountsQueryOptions } from '@/features/roles/hooks/useNameRoleAccounts'
import { getNameRolesForAccountQueryOptions } from '@/features/roles/hooks/useNameRolesForAccount'
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

  const [accountsQuery, ownerRolesQuery] = useQueries({
    queries: [
      {
        ...getNameRolesAccountsQueryOptions({ name, registryAddress }),
        enabled: label !== null,
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
    ],
  })

  if (label === null || accountsQuery.isError || ownerRolesQuery.isError)
    return { status: 'error' }

  // Keyed off `isSuccess`, not `!isLoading`: a query that hasn't run (or has
  // failed) also has `data === undefined`, which must not read as "no grants".
  if (!accountsQuery.isSuccess || !ownerRolesQuery.isSuccess)
    return { status: 'pending' }

  return planRoleRevocations({
    accounts: accountsQuery.data,
    owner,
    ownerRoles: ownerRolesQuery.data.decoded ?? [],
  })
}
