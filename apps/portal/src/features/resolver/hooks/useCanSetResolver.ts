/**
 * Whether the connected wallet can set the resolver on a name, and where that
 * write would go.
 *
 * The two protocol versions keep the resolver pointer in different places and
 * authorise it differently, and only V2 has roles at all:
 * - ENSv2 — the pointer lives on the parent's PermissionedRegistry, keyed by
 *   canonical label id, and `ROLE_SET_RESOLVER` authorises it.
 * - ENSv1 — the pointer lives on the name's legacy registry slot, and whoever
 *   holds that slot authorises it (see {@link canSetV1Resolver}).
 *
 * Asking for the role either way hid the button from every V1 owner: `hasRoles`
 * is a PermissionedRegistry read, and a V1 name reports the legacy registry as
 * its `registryAddress`, which has no such function — so the call reverted, the
 * query errored, and a falsy answer read as "not permitted".
 */

import { useQuery } from '@tanstack/react-query'
import { type Address, zeroAddress } from 'viem'
import { useConnection } from 'wagmi'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import { getHasRolesQueryOptions } from '@/features/registry/hooks/useHasRoles'
import { getNameRegistriesQueryOptions } from '@/features/registry/hooks/useNameRegistryDiscovery'
import type { ResolverWriteTarget } from '@/features/resolver/helpers/changeResolver'
import type { V1TransferSubject } from '@/features/transfer/types'
import { getV1NameStateQueryOptions } from '@/features/transfer/v1/getV1NameState'
import { canSetV1Resolver } from '@/features/transfer/v1/rules'

type UseCanSetResolverReturn = {
  readonly canSet: boolean
  readonly isLoading: boolean
  /** Null while unknown, or when no registry holds the name. */
  readonly target: ResolverWriteTarget | null
}

type Derivation = {
  readonly isV2: boolean
  readonly registryAddress: Address | undefined
  readonly v1Subject: V1TransferSubject | null
}

const deriveTarget = ({
  isV2,
  registryAddress,
  v1Subject,
}: Derivation): ResolverWriteTarget | null => {
  if (isV2) {
    return registryAddress ? { protocol: 'ENSv2', registryAddress } : null
  }
  if (!v1Subject) return null
  return { protocol: 'ENSv1', isWrapped: v1Subject.kind === 'v1-wrapped' }
}

const deriveCanSet = ({
  account,
  isV2,
  hasRole,
  v1Subject,
}: Pick<Derivation, 'isV2' | 'v1Subject'> & {
  readonly account: Address | undefined
  readonly hasRole: boolean | undefined
}): boolean => {
  if (!account) return false
  if (isV2) return hasRole === true
  return !!v1Subject && canSetV1Resolver({ subject: v1Subject, account })
}

export function useCanSetResolver({
  name,
}: {
  readonly name: string
}): UseCanSetResolverReturn {
  const { address: account } = useConnection()

  const ownerQuery = useQuery({
    ...getEnsOwnerQueryOptions({ name }),
    enabled: !!name,
  })
  const protocolVersion = ownerQuery.data?.protocolVersion
  const isV1 = protocolVersion === 'ENSv1'
  const isV2 = protocolVersion === 'ENSv2'

  const registryQuery = useQuery({
    ...getNameRegistriesQueryOptions({ name }),
    enabled: !!name && isV2,
  })
  // Index 1 is the registry holding the leaf label, which is where the pointer
  // lives. Read only for V2 — see the note above on the legacy registry.
  const registryAddress = isV2
    ? (registryQuery.data?.[1] ?? undefined)
    : undefined

  const roleQuery = useQuery({
    ...getHasRolesQueryOptions({
      registryAddress: registryAddress ?? zeroAddress,
      label: name.split('.')[0],
      roles: ['ROLE_SET_RESOLVER'],
      account: account ?? zeroAddress,
    }),
    enabled: !!account && !!registryAddress,
  })

  const v1Query = useQuery({
    ...getV1NameStateQueryOptions({ name }),
    enabled: !!name && isV1,
  })
  // Gated on `isV1` rather than on the query alone: a disabled query stops
  // fetching but keeps its cache, so a name once read as V1 would go on
  // answering from that stale subject after it resolves as V2.
  const v1Subject = isV1 ? (v1Query.data?.subject ?? null) : null

  const v2Loading =
    registryQuery.isLoading || (!!registryAddress && roleQuery.isLoading)

  return {
    canSet: deriveCanSet({ account, isV2, hasRole: roleQuery.data, v1Subject }),
    isLoading:
      ownerQuery.isLoading ||
      (isV2 && v2Loading) ||
      (isV1 && v1Query.isLoading),
    target: deriveTarget({ isV2, registryAddress, v1Subject }),
  }
}
