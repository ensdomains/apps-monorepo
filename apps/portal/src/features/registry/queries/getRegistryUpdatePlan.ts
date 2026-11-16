import {
  planRegistryRepair,
  type RegistryRepairPlan,
  type RegistryRepairReadError,
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
import { registryRoles } from '@ensdomains/ensjs/utils/v2'
import { eacHasRolesSnippet } from '@ensdomains/ensjs-abi/v2/enhancedAccessControl'
import { permissionedRegistryGetSubregistrySnippet } from '@ensdomains/ensjs-abi/v2/permissionedRegistry'
import {
  err,
  errAsync,
  fromPromise,
  ok,
  okAsync,
  type Result,
  type ResultAsync,
} from 'neverthrow'
import {
  type Address,
  type GetCodeErrorType,
  labelhash,
  publicActions,
  type ReadContractErrorType,
} from 'viem'
import {
  computeRegistryUpdateSalt,
  getRegistryUpdateBlocker,
  MAX_UPGRADE_ATTEMPTS,
  RegistryUpdateBlockedError,
  shouldStartFreshCopy,
} from '@/features/registry/utils/registryUpdate'
import { safeGetClient } from '@/lib/wagmi/helpers'

type ClientError =
  ReturnType<typeof safeGetClient> extends Result<unknown, infer E> ? E : never

export class GetRegistryUpdatePlanError extends TaggedError(
  'GetRegistryUpdatePlanError',
)<{
  readonly cause:
    | ClientError
    | ReadContractErrorType
    | GetCodeErrorType
    | RegistryRepairReadError
}> {}

type GetRegistryUpdatePlanParameters = {
  readonly registryAddress: Address
  /** Where the name lives; the registry's own `getParent` may never have been set. */
  readonly parent: { readonly registry: Address; readonly label: string }
  /** The account that will send the update; it deploys the replacement. */
  readonly account: Address
}

export type RegistryUpdatePlan = {
  readonly plan: RegistryRepairPlan
  readonly expiredLabels: readonly string[]
  readonly salt: bigint
}

const readFailed = (cause: GetRegistryUpdatePlanError['cause']) =>
  new GetRegistryUpdatePlanError({ cause })

/** Everything an update still has to send, resuming from whatever an earlier attempt already copied. */
const getRegistryUpdatePlan = ResultFn(async function* ({
  registryAddress,
  parent,
  account,
}: GetRegistryUpdatePlanParameters) {
  const client = (yield* safeGetClient().mapErr(readFailed)).extend(
    publicActions,
  )
  const contracts = getDestinationContracts(client.chain.id)
  const [currentSubregistry, canSwitch] = yield* fromPromise(
    Promise.all([
      client.readContract({
        address: parent.registry,
        abi: permissionedRegistryGetSubregistrySnippet,
        functionName: 'getSubregistry',
        args: [parent.label],
      }),
      // The switch needs this role on the name, from the name or the root; check it before the copy.
      client.readContract({
        address: parent.registry,
        abi: eacHasRolesSnippet,
        functionName: 'hasRoles',
        args: [
          BigInt(labelhash(parent.label)),
          registryRoles.ROLE_SET_SUBREGISTRY,
          account,
        ],
      }),
    ]),
    (cause) => readFailed(cause as ReadContractErrorType),
  )
  const blocker = getRegistryUpdateBlocker({
    chainId: client.chain.id,
    implementation: contracts.userRegistryImpl,
    registry: registryAddress,
    currentSubregistry,
    label: parent.label,
    canSwitch,
  })
  if (blocker) return err(new RegistryUpdateBlockedError({ reason: blocker }))

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
  const findLatestAttempt = (
    attempt: bigint,
  ): ResultAsync<
    bigint,
    GetRegistryUpdatePlanError | RegistryUpdateBlockedError
  > =>
    attempt >= MAX_UPGRADE_ATTEMPTS
      ? errAsync(
          new RegistryUpdateBlockedError({ reason: 'too-many-attempts' }),
        )
      : fromPromise(
          client.getCode({ address: replacementAt(attempt).address }),
          (cause) => readFailed(cause as GetCodeErrorType),
        ).andThen((code) =>
          code && code !== '0x'
            ? findLatestAttempt(attempt + 1n)
            : okAsync(attempt - 1n),
        )
  const read = (registry: Address, knownParent?: typeof parent) =>
    readRegistryRepairState({
      client,
      registry,
      fromBlock: contracts.verifiableFactoryDeployBlock,
      ...(knownParent && { parent: knownParent }),
    }).mapErr(readFailed)
  const state = yield* read(registryAddress, parent)

  /** Plans the copy into `attempt`; child registries still on the original or an earlier attempt move with it. */
  const planAt = (attempt: bigint, existing: RegistryRepairState | null) => {
    const replacement = replacementAt(attempt)
    const fromRegistries = [
      registryAddress,
      ...Array.from(
        { length: Number(attempt) },
        (_, i) => replacementAt(BigInt(i)).address,
      ),
    ]
    return readChildRegistries({
      client,
      fromRegistries,
      names: state.names,
      account,
    })
      .mapErr(readFailed)
      .andThen((children) =>
        planRegistryRepair({
          state,
          existing,
          children,
          account,
          factory: contracts.verifiableFactory,
          implementation: contracts.userRegistryImpl,
          salt: replacement.salt,
          replacement: replacement.address,
        }),
      )
      .map((plan) => ({ plan, salt: replacement.salt }))
  }

  const latest = yield* findLatestAttempt(0n)
  const resumed =
    latest >= 0n
      ? await planAt(latest, yield* read(replacementAt(latest).address))
      : null
  // The original changed after part of the copy landed: start a fresh copy at the next attempt.
  const { plan, salt } = yield* resumed && !shouldStartFreshCopy(resumed)
    ? resumed
    : await planAt(latest + 1n, null)

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
