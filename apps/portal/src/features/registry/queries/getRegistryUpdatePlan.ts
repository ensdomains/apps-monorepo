import {
  planRegistryRepair,
  type RegistryRepairPlan,
  readChildRegistries,
  readRegistryRepairState,
} from '@ens-apps/migration'
import {
  computeVerifiableProxyAddress,
  getDestinationContracts,
} from '@ens-apps/smart-account'
import { ResultFn, TaggedError } from '@ens-apps/utils/neverthrow'
import { resultQueryOptions } from '@ens-apps/utils/tanstack-query/neverthrow'
import { createQueryKey } from '@ens-apps/utils/tanstack-query/queryKey'
import { permissionedRegistryGetSubregistrySnippet } from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import { err, fromPromise, ok } from 'neverthrow'
import { type Address, publicActions } from 'viem'
import {
  computeRegistryUpdateSalt,
  getRegistryUpdateBlocker,
} from '@/features/registry/utils/registryUpdate'
import { safeGetClient } from '@/lib/wagmi/helpers'

class GetRegistryUpdatePlanError extends TaggedError(
  'GetRegistryUpdatePlanError',
)<{
  readonly cause: unknown
}> {}

type GetRegistryUpdatePlanParameters = {
  readonly registryAddress: Address
  /** Where the name lives; the registry's own `getParent` may never have been set. */
  readonly parent: { readonly registry: Address; readonly label: string }
  /** The account that will send the update; it deploys the replacement. */
  readonly account: Address
  /** Unix seconds; names expired by then can't be copied. */
  readonly now: bigint
}

export type RegistryUpdatePlan = {
  readonly plan: RegistryRepairPlan
  readonly expiredLabels: readonly string[]
  readonly salt: bigint
}

const toError = (cause: unknown) => new GetRegistryUpdatePlanError({ cause })

/** Everything an update still has to send, resuming from whatever an earlier attempt already copied. */
const getRegistryUpdatePlan = ResultFn(async function* ({
  registryAddress,
  parent,
  account,
  now,
}: GetRegistryUpdatePlanParameters) {
  const client = (yield* safeGetClient().mapErr(toError)).extend(publicActions)
  const contracts = getDestinationContracts(client.chain.id)
  const currentSubregistry = yield* fromPromise(
    client.readContract({
      address: parent.registry,
      abi: permissionedRegistryGetSubregistrySnippet,
      functionName: 'getSubregistry',
      args: [parent.label],
    }),
    toError,
  )
  const blocker = getRegistryUpdateBlocker({
    chainId: client.chain.id,
    implementation: contracts.userRegistryImpl,
    registry: registryAddress,
    currentSubregistry,
    label: parent.label,
  })
  if (blocker) return err(toError(blocker))

  const salt = computeRegistryUpdateSalt(registryAddress)
  const replacement = computeVerifiableProxyAddress({
    factory: contracts.verifiableFactory,
    proxyLogic: contracts.verifiableFactoryProxyLogic,
    deployer: account,
    salt,
  })
  const read = (registry: Address, knownParent?: typeof parent) =>
    readRegistryRepairState({
      client,
      registry,
      fromBlock: contracts.verifiableFactoryDeployBlock,
      now,
      ...(knownParent && { parent: knownParent }),
    }).mapErr(toError)

  const state = yield* read(registryAddress, parent)
  const code = yield* fromPromise(
    client.getCode({ address: replacement }),
    toError,
  )
  const existing = code && code !== '0x' ? yield* read(replacement) : null
  const children = yield* readChildRegistries({
    client,
    registry: registryAddress,
    names: state.names,
    account,
  }).mapErr(toError)

  const plan = yield* planRegistryRepair({
    state,
    existing,
    children,
    account,
    factory: contracts.verifiableFactory,
    implementation: contracts.userRegistryImpl,
    salt,
    replacement,
  }).mapErr(toError)

  const result: RegistryUpdatePlan = {
    plan,
    expiredLabels: state.expiredLabels,
    salt,
  }
  return ok(result)
})

const getRegistryUpdatePlanQueryKey = createQueryKey<
  'registry-update-plan',
  GetRegistryUpdatePlanParameters
>('registry-update-plan')

export const getRegistryUpdatePlanQueryOptions = (
  params: GetRegistryUpdatePlanParameters,
) =>
  resultQueryOptions({
    queryKey: getRegistryUpdatePlanQueryKey(params),
    queryFn: ({ queryKey: [, queryParams] }) =>
      getRegistryUpdatePlan(queryParams),
    // Each attempt plans from what is on chain now, so a resume never repeats sent calls.
    staleTime: 0,
  })
