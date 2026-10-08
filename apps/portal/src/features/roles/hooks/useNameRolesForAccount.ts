import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { getNameRolesForAccount as ensjsGetNameRolesForAccount } from '@ensdomains/ensjs/public/v2'
import { permissionedRegistryRolesSnippet } from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import { fromPromise, ok } from 'neverthrow'
import type { Address } from 'viem'
import { readContract } from 'viem/actions'
import { getAction } from 'viem/utils'
import type { ResourceId } from '@/lib/resource/resourceId'
import { decodeRoleBitmap } from '@/lib/roles/decodeRoleBitmap'
import { safeGetClient } from '@/lib/wagmi/helpers'

class GetNameRolesForAccountError extends TaggedError(
  'GetNameRolesForAccountError',
)<{
  cause: unknown
}> {}

type ByLabel = {
  readonly registryAddress: Address
  readonly label: string
  readonly account: Address
}

/**
 * The same question, asked with the name's id.
 *
 * Preferred wherever the answer gates an action whose write addresses the name
 * by id: a label is hashed by `labelhash`, which passes an encoded
 * (`[<64 hex>]`) label through unhashed, so a gate asked by label can answer
 * about a different name than the write targets (WEB-1458). A `null` resource
 * answers "no roles" rather than falling back to the label.
 */
type ByResource = {
  readonly registryAddress: Address
  readonly resource: ResourceId | null
  readonly account: Address
}

type GetNameRolesForAccountParameters = ByLabel | ByResource

const isByResource = (
  params: GetNameRolesForAccountParameters,
): params is ByResource => 'resource' in params

const getNameRolesForAccount = ResultFn(async function* (
  params: GetNameRolesForAccountParameters,
) {
  const client = yield* safeGetClient()

  // ensjs' action only takes a label, so the id path reads the same contract
  // function directly, with the resource supplied rather than re-derived.
  // `PermissionedRegistry.roles` canonicalises whatever id it is given.
  if (isByResource(params)) {
    const { registryAddress, resource, account } = params
    if (resource === null) return ok({ decoded: [], raw: 0n })

    const readContractAction = getAction(client, readContract, 'readContract')

    const raw = yield* fromPromise(
      readContractAction({
        address: registryAddress,
        abi: permissionedRegistryRolesSnippet,
        functionName: 'roles',
        args: [resource, account],
      }),
      (e) => new GetNameRolesForAccountError({ cause: e }),
    )

    return ok({ decoded: decodeRoleBitmap(raw as bigint), raw: raw as bigint })
  }

  const result = yield* await fromPromise(
    ensjsGetNameRolesForAccount(client, params),
    (e) => new GetNameRolesForAccountError({ cause: e }),
  )

  return ok(result)
})

const getNameRolesForAccountQueryKey = createQueryKey<
  'getNameRolesForAccount',
  Record<string, unknown>
>('getNameRolesForAccount')

export const getNameRolesForAccountQueryOptions = (
  params: GetNameRolesForAccountParameters,
) =>
  resultQueryOptions({
    // `resource` is a bigint, which the default key hash cannot serialise, so
    // the key carries its decimal form while the params keep the typed value.
    queryKey: getNameRolesForAccountQueryKey(
      isByResource(params)
        ? { ...params, resource: params.resource?.toString() ?? null }
        : { ...params },
    ),
    queryFn: () => getNameRolesForAccount(params),
  })
