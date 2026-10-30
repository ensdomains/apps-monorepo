import { encodeAsToContentType } from '@ensdomains/ensjs/utils'
import { useQueries, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { match } from 'ts-pattern'
import { type Address, isAddressEqual, zeroAddress } from 'viem'
import { useConnection } from 'wagmi'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { canEditRecords } from '@/features/records/helpers/canEditRecords'
import type { RecordEditLock } from '@/features/records/helpers/recordEditLock'
import { useNameHasOwnResolver } from '@/features/records/hooks/useNameHasOwnResolver'
import { useNameResolverAddress } from '@/features/records/hooks/useNameResolverAddress'
import { useRecordEditLock } from '@/features/records/hooks/useRecordEditLock'
import { getHasRolesQueryOptions } from '@/features/registry/hooks/useHasRoles'
import { getIsPermissionedResolverQueryOptions } from '@/features/resolver/hooks/useIsPermissionedResolver'
import { getResolverSetterGrantsQueryOptions } from '@/features/resolver/hooks/useResolverSetterGrants'
import { getCanModifyNameOnResolverQueryOptions } from '@/features/resolver/queries/getCanModifyNameOnResolver'
import {
  computeResolverResource,
  type ResolverPermissionKey,
  type ResolverSetterScope,
  ROOT_RESOURCE,
  resolverSetterScopeRole,
} from '@/lib/roles/resolverRoles'
import {
  ALL_EDITABLE_TYPES,
  type EditableTypes,
  NO_EDITABLE_TYPES,
  type RecordType,
} from '@/utils/records/editRecordUtils'

const RECORD_TYPE_ROLES = {
  text: 'ROLE_SET_TEXT',
  address: 'ROLE_SET_ADDRESS',
  abi: 'ROLE_SET_ABI',
  contentHash: 'ROLE_SET_CONTENTHASH',
} as const satisfies Record<RecordType, ResolverPermissionKey>

/** Roles that authorize writing common profile records on a permissioned resolver. */
export const RECORD_EDIT_ROLES = Object.values(RECORD_TYPE_ROLES)

const toPermissionedEditableTypes = (
  grantedRoles: readonly ResolverPermissionKey[],
  grantedScopes: readonly ResolverSetterScope[],
): EditableTypes => ({
  text: grantedRoles.includes(RECORD_TYPE_ROLES.text)
    ? 'all'
    : new Set(
        grantedScopes.flatMap((scope) =>
          scope.kind === 'text' ? [scope.key] : [],
        ),
      ),
  address: grantedRoles.includes(RECORD_TYPE_ROLES.address)
    ? 'all'
    : new Set(
        grantedScopes.flatMap((scope) =>
          scope.kind === 'address' ? [scope.coinType] : [],
        ),
      ),
  abi:
    grantedRoles.includes(RECORD_TYPE_ROLES.abi) ||
    grantedScopes.some((scope) => scope.kind === 'abi'),
  contentHash: grantedRoles.includes(RECORD_TYPE_ROLES.contentHash),
})

type UseCanEditRecordsParams = {
  name: string
  /** Roles that count as “can edit”. Defaults to the main record-write roles. */
  roles?: readonly ResolverPermissionKey[]
  /**
   * One setter argument (a coin type, a text key) to check in addition to the
   * root scope, for callers editing a single record.
   */
  scope?: ResolverSetterScope
  enabled?: boolean
}

type UseCanEditRecordsReturn = {
  canEdit: boolean
  isLoading: boolean
  /** A read failed, so `canEdit` is unknown rather than `false`. */
  isError: boolean
  /** True when the connected wallet is the name token owner. */
  isOwner: boolean
  /**
   * False when the resolver answering for the name is inherited from an
   * ancestor (or absent) rather than set on the name itself, so there is
   * nothing to write records to. Undefined until known.
   */
  hasOwnResolver: boolean | undefined
  resolverAddress: Address | null | undefined
  editableTypes: EditableTypes
  /**
   * Set when the resolver is not a contract, or when ownership alone would
   * have allowed editing but the resolver refuses this wallet.
   */
  readonly editLock: RecordEditLock | undefined
}

/**
 * Whether the connected wallet can edit records for `name`.
 *
 * - Permissioned resolvers: authorized by resolver `ROLE_SET_*` on the root
 *   resource (every name) or on the setter argument in `scope`. Without a
 *   `scope`, grants on single text keys or coin types count too, and open only
 *   those keys in `editableTypes`. Roles are per
 *   resolver, not per name, so after a transfer that keeps the resolver the
 *   previous owner typically retains them while the new token owner does not.
 * - V2 names on any other resolver: PublicResolverV2's `canModifyName`, or a
 *   dry run of the record write for any other resolver (a recreated child
 *   keeps its V1 PublicResolver, which still authorizes the V1 owner and its
 *   delegates). Token ownership alone grants nothing there.
 * - V1 names on a non-permissioned resolver: falls back to token ownership,
 *   except where {@link useRecordEditLock} finds that locked out.
 * - Never when the resolver is not a contract: nothing there can take a write.
 *
 * Either way the name must own its resolver. One inherited through ENSIP-10
 * wildcard resolution — a DNS name resolving through its TLD's
 * OffchainDNSResolver, say — reads fine but takes no writes, and ownership of
 * the name grants nothing on a resolver that belongs to an ancestor. See
 * {@link useNameHasOwnResolver}.
 */
export function useCanEditRecords({
  name,
  roles = RECORD_EDIT_ROLES,
  scope,
  enabled = true,
}: UseCanEditRecordsParams): UseCanEditRecordsReturn {
  const { address: connectedAddress } = useConnection()

  const ownerQuery = useQuery({
    ...getEnsOwnerQueryOptions({ name }),
    enabled: enabled && !!name,
  })

  const resolverQuery = useNameResolverAddress({
    name: enabled ? name : undefined,
  })
  const resolverAddress = resolverQuery.data

  // Which registry holds the name decides where its own resolver pointer
  // lives, so the check waits on the owner query for the protocol version
  // rather than assuming the v2 walk can answer for a v1 name.
  const ownResolverQuery = useNameHasOwnResolver({
    name: enabled ? name : undefined,
    protocolVersion: ownerQuery.data?.protocolVersion,
  })
  const hasOwnResolver = ownResolverQuery.data

  const isPermissionedQuery = useQuery({
    ...getIsPermissionedResolverQueryOptions({
      resolverAddress: resolverAddress ?? zeroAddress,
    }),
    enabled: enabled && !!resolverAddress,
  })

  // The contract ORs root roles into every resource check, so checking the
  // setter resource covers both "granted everywhere" and "granted for this
  // argument". Without a scope only the root resource is meaningful.
  const resource = useMemo(
    () => (scope ? computeResolverResource(scope) : ROOT_RESOURCE),
    [scope],
  )

  const isPermissioned = isPermissionedQuery.data === true

  const canReadRoles =
    enabled && !!connectedAddress && !!resolverAddress && isPermissioned
  const roleHolder = {
    resolverAddress: resolverAddress ?? zeroAddress,
    account: connectedAddress ?? zeroAddress,
  }
  const isReadingGrants = canReadRoles && !scope

  const grantsQuery = useQuery({
    ...getResolverSetterGrantsQueryOptions(roleHolder),
    // A disabled query still serves its cached grants.
    select: (grants) =>
      isReadingGrants
        ? grants.filter(
            (grant) =>
              grant.kind !== 'abi' ||
              grant.contentType === BigInt(encodeAsToContentType('json')),
          )
        : [],
    enabled: isReadingGrants,
  })
  const { data: scopes = [] } = grantsQuery

  const { grantedRoles, grantedScopes, roleQueries } = useQueries({
    queries: [
      ...roles.map((role) => ({ role, resource })),
      ...scopes.map((grant) => ({
        role: resolverSetterScopeRole(grant),
        resource: computeResolverResource(grant),
      })),
    ].map((check) => ({
      ...getHasRolesQueryOptions({
        ...roleHolder,
        resource: check.resource,
        roles: [check.role],
      }),
      enabled: canReadRoles,
    })),
    combine: (results) => ({
      grantedRoles: roles.filter((_, index) => results[index]?.data === true),
      grantedScopes: scopes.filter(
        (_, index) => results[roles.length + index]?.data === true,
      ),
      roleQueries: results,
    }),
  })

  const isV2 = ownerQuery.data?.protocolVersion === 'ENSv2'

  const resolverWriteQuery = useQuery({
    ...getCanModifyNameOnResolverQueryOptions({ ...roleHolder, name }),
    enabled:
      enabled &&
      !!connectedAddress &&
      !!resolverAddress &&
      isV2 &&
      isPermissionedQuery.isSuccess &&
      !isPermissioned,
  })

  const isOwner =
    !!connectedAddress &&
    !!ownerQuery.data?.owner &&
    isAddressEqual(connectedAddress, ownerQuery.data.owner)

  const { editLock, queries: lockQueries } = useRecordEditLock({
    name,
    enabled,
    // The fuse lock applies only to the ownership fallback.
    isOwnershipFallback:
      isOwner && !isV2 && isPermissionedQuery.isSuccess && !isPermissioned,
    resolverAddress,
    account: connectedAddress,
  })

  // A disabled query is neither loading nor errored, so each read only counts
  // once its `enabled` gate opens.
  const queries = [
    ownerQuery,
    resolverQuery,
    ownResolverQuery,
    isPermissionedQuery,
    ...(isReadingGrants ? [grantsQuery] : []),
    ...roleQueries,
    resolverWriteQuery,
    ...lockQueries,
  ]
  const isLoading = enabled && queries.some((query) => query.isLoading)
  const isError = queries.some((query) => query.isError)

  // Anything but a definite "yes" blocks the write: the query throws rather
  // than guessing when it cannot reach the chain, and a write sent on an
  // unverified resolver is the failure this check exists to prevent.
  const isSettled =
    enabled &&
    !!connectedAddress &&
    !isLoading &&
    !!resolverAddress &&
    hasOwnResolver === true

  const canEdit = canEditRecords({
    isSettled,
    isPermissioned,
    isV2,
    hasGrant: grantedRoles.length + grantedScopes.length > 0,
    canWriteOnResolver: resolverWriteQuery.data,
    isOwner,
    editLock,
  })

  return {
    canEdit,
    isLoading,
    isError,
    isOwner,
    hasOwnResolver,
    resolverAddress,
    editLock,
    editableTypes: match({ canEdit, isPermissioned })
      .with({ canEdit: false }, () => NO_EDITABLE_TYPES)
      .with({ isPermissioned: false }, () => ALL_EDITABLE_TYPES)
      .otherwise(() =>
        toPermissionedEditableTypes(grantedRoles, grantedScopes),
      ),
  }
}
