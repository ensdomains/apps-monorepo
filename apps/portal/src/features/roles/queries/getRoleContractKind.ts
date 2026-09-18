import { ResultFn } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { ok } from 'neverthrow'
import type { Address } from 'viem'
import { getIsPermissionedResolver } from '@/features/resolver/hooks/useIsPermissionedResolver'
import { getSupportsInterfaces } from '@/hooks/useSupportsInterfaces'
import {
  classifyRoleContract,
  PERMISSIONED_REGISTRY_INTERFACE_ID,
} from '../utils/roleContractKind'

interface GetRoleContractKindParams {
  readonly address: Address
}

/**
 * Reads which role model `address` uses: a PermissionedResolver (its
 * implementation is on the allowlist) or a registry (it reports
 * `IPermissionedRegistry` over ERC-165). The indexer is not consulted: it lists
 * any address that ever appeared in `SubregistryUpdated` as a registry.
 */
export const getRoleContractKind = ResultFn(async function* ({
  address,
}: GetRoleContractKindParams) {
  const isPermissionedResolver = yield* getIsPermissionedResolver({
    resolverAddress: address,
  })

  // A contract without `supportsInterface`, or no contract at all, reads as
  // `false` here; only a transport failure is an error.
  const [isPermissionedRegistry] = yield* getSupportsInterfaces({
    address,
    interfaces: [PERMISSIONED_REGISTRY_INTERFACE_ID],
  })

  return ok(
    classifyRoleContract({
      isPermissionedResolver,
      isPermissionedRegistry: isPermissionedRegistry === true,
    }),
  )
})

const getRoleContractKindQueryKey = createQueryKey<
  'role-contract-kind',
  GetRoleContractKindParams
>('role-contract-kind')

export const getRoleContractKindQueryOptions = (
  params: GetRoleContractKindParams,
) =>
  resultQueryOptions({
    queryKey: getRoleContractKindQueryKey(params),
    queryFn: ({ queryKey: [, queryParams] }) =>
      getRoleContractKind(queryParams),
  })
