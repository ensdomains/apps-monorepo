import {
  planRegistryRepair,
  type RegistryRepairPlan,
  type RegistryRepairState,
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
  shouldStartFreshCopy,
} from '@/features/registry/utils/registryUpdate'
import { safeGetClient } from '@/lib/wagmi/helpers'

export class GetRegistryUpdatePlanError extends TaggedError(
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

/** A stopped upgrade that can't be resumed starts over at a new address; this bounds how many times. */
const MAX_UPGRADE_ATTEMPTS = 16n

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

  const replacementAt = (attempt: bigint) => {
    const salt = computeRegistryUpdateSalt(registryAddress, attempt)
    return {
      salt,
      address: computeVerifiableProxyAddress({
        factory: contracts.verifiableFactory,
        proxyLogic: contracts.verifiableFactoryProxyLogic,
        deployer: account,
        salt,
      }),
    }
  }
  // Each attempt deploys at its own address; the latest one with code is the copy to resume.
  const findLatestAttempt = async (attempt: bigint): Promise<bigint> => {
    if (attempt >= MAX_UPGRADE_ATTEMPTS) throw new Error('too-many-attempts')
    const code = await client.getCode({
      address: replacementAt(attempt).address,
    })
    return code && code !== '0x'
      ? findLatestAttempt(attempt + 1n)
      : attempt - 1n
  }
  const read = (registry: Address, knownParent?: typeof parent) =>
    readRegistryRepairState({
      client,
      registry,
      fromBlock: contracts.verifiableFactoryDeployBlock,
      now,
      ...(knownParent && { parent: knownParent }),
    }).mapErr(toError)

  const state = yield* read(registryAddress, parent)
  const latest = yield* fromPromise(findLatestAttempt(0n), toError)
  const children = yield* readChildRegistries({
    client,
    registry: registryAddress,
    names: state.names,
    account,
  }).mapErr(toError)

  const planAt = (attempt: bigint, existing: RegistryRepairState | null) => {
    const replacement = replacementAt(attempt)
    return planRegistryRepair({
      state,
      existing,
      children,
      account,
      factory: contracts.verifiableFactory,
      implementation: contracts.userRegistryImpl,
      salt: replacement.salt,
      replacement: replacement.address,
    }).map((plan) => ({ plan, salt: replacement.salt }))
  }
  const resumed =
    latest >= 0n
      ? planAt(latest, yield* read(replacementAt(latest).address))
      : null
  // The original changed after part of the copy landed: start a fresh copy at the next attempt.
  const { plan, salt } = yield* (
    resumed && !shouldStartFreshCopy(resumed)
      ? resumed
      : planAt(latest + 1n, null)
  ).mapErr(toError)

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
