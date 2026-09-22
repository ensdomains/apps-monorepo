import { useQueries } from '@tanstack/react-query'
import { type Address, zeroAddress } from 'viem'
import { getNameRegistriesQueryOptions } from '@/features/registry/hooks/useNameRegistryDiscovery'
import { getNameRolesForAccountQueryOptions } from '@/features/roles/hooks/useNameRolesForAccount'
import { getLabel } from '@/utils/token/getLabel'
import { getEthAddressQueryOptions } from '../queries/getEthAddress'
import { getOwnResolverQueryOptions } from '../queries/getOwnResolver'
import type { TransferDetachTargets } from '../types'

// A detach step is a registry write, not a plain owner operation: the registry
// gates `setResolver`/`setSubregistry` on the owner holding the matching role.
// A normally-registered name auto-holds these, but a migrated/locked name can
// own the token yet lack them (a migrated locked 2LD never receives
// ROLE_SET_SUBREGISTRY — its subregistry is the emancipated-subnames wrapper),
// so the write reverts with EACUnauthorizedAccountRoles. Since the detach steps
// run *before* the (irreversible) token transfer, offering an option the owner
// can't perform walks them into a partial, unrecoverable failure — the same
// trap `useCanTransferName` guards for the transfer itself. So an option is only
// shown when there's a target AND the owner holds the role to detach it.
//
// "A target" means one attached to *this* name, not one it merely inherits.
// Subnames routinely have no resolver of their own and resolve through an
// ancestor's; detaching or writing to that resolver isn't the sender's to do
// (see `getOwnResolver`), so both resolver-dependent options key off the name's
// own registry slot rather than what the UniversalResolver reports.

type UseTransferDetachTargetsParams = {
  readonly name: string
  /** The registry the name's token lives in (its parent's subregistry). */
  readonly registryAddress: Address
  /** The current token owner, whose detach permissions to check. */
  readonly owner: Address
}

/**
 * Discover what a name currently points at, so the transfer form knows which
 * options to offer: the ETH-address repoint only when the name has its own
 * resolver carrying an ETH address, the resolver/registry detaches only when
 * there's something of the name's own to detach *and* the owner can actually
 * detach it (see the role note above).
 *
 * Keys off `isSuccess` (not `!isLoading`) so a failed lookup — which also has
 * `data === undefined` — doesn't look like "nothing to detach"; callers block on
 * {@link hasFailed} instead of transferring with the options silently disabled.
 */
export const useTransferDetachTargets = ({
  name,
  registryAddress,
  owner,
}: UseTransferDetachTargetsParams): TransferDetachTargets & {
  /** The name's own subregistry, for sizing what detaching it would break. */
  readonly subregistryAddress: Address | null
} => {
  // getLabel normalises and can throw on a malformed name; a name we can't parse
  // is one whose roles we can't check, so fall back to "no permission".
  let label: string | null = null
  try {
    label = getLabel(name)
  } catch {}

  const [ownResolverQuery, registriesQuery, ethAddressQuery, rolesQuery] =
    useQueries({
      queries: [
        {
          ...getOwnResolverQueryOptions({
            label: label ?? '',
            registryAddress,
          }),
          enabled: label !== null,
        },
        {
          ...getNameRegistriesQueryOptions({ name }),
          // Opted out of the app-wide one-hour staleTime: this read decides
          // whether to offer `detachRegistry` — an irreversible write — and an
          // hour-old pointer would gate it on a registry that has since moved.
          staleTime: 0,
        },
        getEthAddressQueryOptions({ name }),
        {
          ...getNameRolesForAccountQueryOptions({
            registryAddress,
            label: label ?? '',
            account: owner,
          }),
          enabled: label !== null,
        },
      ],
    })

  const subregistryAddress = registriesQuery.data?.[0]
  const hasOwnResolver = !!ownResolverQuery.data
  const hasSubregistry =
    !!subregistryAddress && subregistryAddress !== zeroAddress
  const hasEthAddress = !!ethAddressQuery.data
  const heldRoles = rolesQuery.data?.decoded ?? []

  return {
    subregistryAddress: hasSubregistry ? subregistryAddress : null,
    isOptionVisible: {
      // An ETH address read through an inherited resolver isn't ours to
      // repoint — the record lives on an ancestor's resolver, not this name's.
      setEthAddress:
        ethAddressQuery.isSuccess &&
        hasEthAddress &&
        ownResolverQuery.isSuccess &&
        hasOwnResolver,
      detachResolver:
        ownResolverQuery.isSuccess &&
        hasOwnResolver &&
        rolesQuery.isSuccess &&
        heldRoles.includes('ROLE_SET_RESOLVER'),
      detachRegistry:
        registriesQuery.isSuccess &&
        hasSubregistry &&
        rolesQuery.isSuccess &&
        heldRoles.includes('ROLE_SET_SUBREGISTRY'),
    },
    isSettled:
      ownResolverQuery.isSuccess &&
      registriesQuery.isSuccess &&
      ethAddressQuery.isSuccess &&
      rolesQuery.isSuccess,
    hasFailed:
      ownResolverQuery.isError ||
      registriesQuery.isError ||
      ethAddressQuery.isError ||
      rolesQuery.isError,
  }
}
