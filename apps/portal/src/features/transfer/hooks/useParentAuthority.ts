import { useQueries } from '@tanstack/react-query'
import { type Address, isAddressEqual, zeroAddress } from 'viem'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { getHasRolesQueryOptions } from '@/features/registry/hooks/useHasRoles'
import { getLabel } from '@/utils/token/getLabel'

/**
 * What a subname's parent owner can still do to it after it has been
 * transferred away — read from the registry rather than assumed.
 *
 * Every power below is a role check against `PermissionedRegistry`, whose
 * `hasRoles` resolves `_effectiveRoles = roles[ROOT_RESOURCE][account] |
 * roles[resource][account]`. A parent's authority normally comes from the *root*
 * roles they hold over the subregistry they issued the name from, so the
 * root-OR is what makes a single per-name check answer the question. (Note this
 * is why `roles()` — what `getNameRolesForAccount` reads — is the wrong call
 * here: it returns the raw per-resource bitmap and misses root roles entirely.)
 *
 * ensjs registry-mode `hasRoles` passes a bare `labelhash` as the resource, and
 * that is exactly right: `PermissionedRegistry.hasRoles` overrides the base
 * implementation with `super.hasRoles(getResource(anyId), …)`, and
 * `_constructResource` rewrites the version bits of whatever id it is handed —
 * so a bare labelhash canonicalises to the same resource the contract checks,
 * `eacVersionId` included.
 *
 * The one role that is *not* a per-name check is `ROLE_REGISTRAR`: `_register`
 * asserts it against `ROOT_RESOURCE` explicitly, never against the name's
 * resource. Checking it per-name would return true for a token-scoped grant
 * that `register()` would still reject, so it is read in registry-root mode.
 *
 * None of this is guaranteed: a parent who issued a name from a registry whose
 * root roles they never held, or later revoked, has no authority over it at all,
 * and the transfer really is final. That is why the form asks rather than
 * asserts.
 */

/** Burns a live token outright, so the reclaim needs no expiry (see below). */
const RECLAIM_ROLE = 'ROLE_UNREGISTER' as const
/** Registering an `AVAILABLE` name — the parent's path back in after expiry. */
const REISSUE_ROLE = 'ROLE_REGISTRAR' as const
/** Held on the *parent's own* token: repoints the registry this name lives in. */
const REPOINT_ROLE = 'ROLE_SET_SUBREGISTRY' as const

export type ParentAuthority = {
  /** The parent name's owner, once known. */
  readonly parentOwner: Address | undefined
  /** The sender owns the parent too, so these powers are theirs to keep. */
  readonly parentIsSelf: boolean
  /**
   * `unregister()` on this name. It is gated by `_checkExpiryAndTokenRoles`,
   * which *reverts once the name is expired* — so this is the live-name path:
   * the holder can burn the recipient's token at any moment, with no waiting.
   */
  readonly canReclaimNow: boolean
  /** `register()` once the name lapses to `AVAILABLE`. */
  readonly canReissueAfterExpiry: boolean
  /**
   * `setSubregistry()` on the parent's token. Points the parent at a different
   * registry, at which point this name stops resolving no matter who owns its
   * token.
   */
  readonly canRepointRegistry: boolean
  /** Any authority at all was found. */
  readonly hasAnyAuthority: boolean
  readonly isLoading: boolean
  /** A lookup failed, so authority is *unknown* — never treat as "none". */
  readonly isError: boolean
}

type UseParentAuthorityParams = {
  readonly name: string
  /** `null` for a 2LD, whose parent is the TLD and not a counterparty. */
  readonly parentName: string | null
  /** The registry holding this name's token — its parent's subregistry. */
  readonly registryAddress: Address
  /** The current token owner, to tell "the parent is you" from a third party. */
  readonly owner: Address
}

/** A name we cannot parse is one whose roles we cannot address. */
const safeLabel = (name: string): string | null => {
  try {
    return getLabel(name)
  } catch {
    return null
  }
}

/** One role check against a registry, disabled until its inputs are known. */
const roleQuery = ({
  registryAddress,
  label,
  role,
  account,
  enabled,
}: {
  registryAddress: Address | undefined
  label: string | null
  role: typeof RECLAIM_ROLE | typeof REISSUE_ROLE | typeof REPOINT_ROLE
  account: Address | undefined
  enabled: boolean
}) => ({
  ...getHasRolesQueryOptions({
    registryAddress: registryAddress ?? zeroAddress,
    label: label ?? '',
    roles: [role],
    account: account ?? zeroAddress,
  }),
  enabled: enabled && !!registryAddress && label !== null && !!account,
})

export const useParentAuthority = ({
  name,
  parentName,
  registryAddress,
  owner,
}: UseParentAuthorityParams): ParentAuthority => {
  const label = safeLabel(name)
  const parentLabel = parentName === null ? null : safeLabel(parentName)
  const isSubname = parentName !== null

  const [ownerQuery] = useQueries({
    queries: [
      {
        ...getEnsOwnerQueryOptions({ name: parentName ?? undefined }),
        enabled: isSubname,
      },
    ],
  })

  const parentOwner = ownerQuery.data?.owner
  // `getEnsOwner` returns the registry that holds the *parent's* label, which is
  // where the parent's own token — and so its `ROLE_SET_SUBREGISTRY` — lives.
  const parentHoldingRegistry = ownerQuery.data?.registryAddress
  const hasParentOwner =
    !!parentOwner && !isAddressEqual(parentOwner, zeroAddress)

  const roleQueries = useQueries({
    queries: [
      roleQuery({
        registryAddress,
        label,
        role: RECLAIM_ROLE,
        account: parentOwner,
        enabled: hasParentOwner,
      }),
      // Root-scoped, not per-name: see the `ROLE_REGISTRAR` note above.
      {
        ...getHasRolesQueryOptions({
          registryAddress,
          roles: [REISSUE_ROLE],
          account: parentOwner ?? zeroAddress,
        }),
        enabled: hasParentOwner,
      },
      roleQuery({
        registryAddress: parentHoldingRegistry,
        label: parentLabel,
        role: REPOINT_ROLE,
        account: parentOwner,
        enabled: hasParentOwner,
      }),
    ],
  })

  const [canReclaimNow, canReissueAfterExpiry, canRepointRegistry] =
    roleQueries.map((query) => query.data === true)

  const queries = [ownerQuery, ...roleQueries]
  // A label we could not parse is as unknown as a failed read: both leave the
  // powers unchecked, and the form must not read that as "no authority".
  const isUnparseable = isSubname && (label === null || parentLabel === null)

  return {
    parentOwner,
    parentIsSelf: hasParentOwner && isAddressEqual(parentOwner, owner),
    canReclaimNow,
    canReissueAfterExpiry,
    canRepointRegistry,
    hasAnyAuthority:
      canReclaimNow || canReissueAfterExpiry || canRepointRegistry,
    isLoading: isSubname && queries.some((query) => query.isLoading),
    isError: isUnparseable || queries.some((query) => query.isError),
  }
}
