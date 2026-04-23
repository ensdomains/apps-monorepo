import type { ZeroDevCall } from '@ens-apps/transaction-manager'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import type { Config as WagmiConfig } from '@wagmi/core'
import {
  type Address,
  type Hex,
  namehash,
  type PublicClient,
  zeroAddress,
} from 'viem'
import { V2_CONTRACTS } from '../contracts/addresses'
import { buildAllTransferCalls } from './buildMigrationCalls'
import { buildPreMigrateCall } from './buildPreMigrateCalls'
import { buildProfileReplayCall } from './buildProfileReplayCalls'
import { buildRoleGrantCall } from './buildRoleGrantCalls'
import {
  buildStepDescriptors,
  type MigrationStepDescriptor,
} from './buildStepDescriptors'
import {
  type ClassifiedName,
  classifyNames,
  type GroupedNames,
  groupClassifiedNames,
  type IneligibleName,
  is2LD,
} from './classifyNames'
import type { MigrationPreflight } from './computeMigrationPreflight'
import { predictOwnedPermResAddress } from './ensureOwnedPermRes'
import { fetchV1Profiles, type Profile, profileMapKey } from './fetchV1Profiles'
import {
  calcBundleBytes,
  collectDeferredParentNames,
  computePhase1Names,
  findNestedDeferredParents,
  findUnresolvedParents,
  formatNamesPreview,
  groupDeferredChildrenByParent,
  packPlanBatches,
  partitionChildrenByInPlan,
} from './migrationPlan.helpers'
import { filterNotReserved, resolveParentRegistries } from './preflightChecks'
import type { V1Domain } from './v1SubgraphClient'

export const MAX_BATCH_RAW_BYTES = 50_000

export class MigrationPlanError extends TaggedError('MigrationPlanError')<{
  cause: unknown
  step?: string
}> {}

export type NameBundle = {
  name: ClassifiedName
  calls: ZeroDevCall[]
  bytes: number
}

export type MigrationPlan = {
  migrationOwner: Address
  domains: readonly V1Domain[]
  classified: readonly ClassifiedName[]
  ineligible: readonly IneligibleName[]
  groups: GroupedNames
  preflight: MigrationPreflight
  ownedPermRes: Address | null
  profiles: ReadonlyMap<Hex, Profile>
  notReservedSet: ReadonlySet<string>
  parentRegistries: ReadonlyMap<string, Address>
  batches: readonly NameBundle[][]
  deferredChildren: readonly ClassifiedName[]
  deferredParentNames: readonly string[]
  deferredBatches: readonly NameBundle[][]
  stepDescriptors: readonly MigrationStepDescriptor[]
}

export const buildNameBundle = (params: {
  name: ClassifiedName
  migrationOwner: Address
  defaultResolver: Address
  ownedPermRes: Address | null
  notReservedSet: ReadonlySet<string>
  parentRegistries: ReadonlyMap<string, Address>
  profiles: ReadonlyMap<Hex, Profile>
}): NameBundle => {
  const {
    name,
    migrationOwner,
    defaultResolver,
    ownedPermRes,
    notReservedSet,
    parentRegistries,
    profiles,
  } = params
  const calls: ZeroDevCall[] = []

  if (is2LD(name) && notReservedSet.has(name.domain.name)) {
    calls.push(buildPreMigrateCall(name))
  }

  calls.push(
    ...buildAllTransferCalls({
      classified: [name],
      migrationOwner,
      defaultResolver,
      ownedPermRes,
      parentRegistries,
    }),
  )

  if (name.managerAddress) {
    calls.push(buildRoleGrantCall(name))
  }

  if (ownedPermRes && name.resolverStrategy === 'to-owned-permres') {
    const node = namehash(name.domain.name) as Hex
    const profile = profiles.get(profileMapKey(node))
    if (profile && (profile.texts.length > 0 || profile.addresses.length > 0)) {
      const replayCall = buildProfileReplayCall({
        resolver: ownedPermRes,
        profiles: new Map<Hex, Profile>([[node, profile]]),
      })
      if (replayCall) calls.push(replayCall)
    }
  }

  return { name, calls, bytes: calcBundleBytes(calls) }
}

export const packNamesByPayload = (params: {
  names: readonly ClassifiedName[]
  migrationOwner: Address
  defaultResolver: Address
  ownedPermRes: Address | null
  notReservedSet: ReadonlySet<string>
  parentRegistries: ReadonlyMap<string, Address>
  profiles: ReadonlyMap<Hex, Profile>
  maxBatchBytes?: number
}): NameBundle[][] => {
  const { names, maxBatchBytes = MAX_BATCH_RAW_BYTES } = params
  const bundles = names.map((name) => buildNameBundle({ ...params, name }))
  const batches: NameBundle[][] = []
  let current: NameBundle[] = []
  let running = 0
  for (const b of bundles) {
    if (current.length > 0 && running + b.bytes > maxBatchBytes) {
      batches.push(current)
      current = []
      running = 0
    }
    current.push(b)
    running += b.bytes
  }
  if (current.length > 0) batches.push(current)
  return batches
}

const fetchProfilesForNames = async (params: {
  namesToOwnedPermRes: readonly ClassifiedName[]
  preflight: MigrationPreflight
  publicClient: PublicClient
}): Promise<Map<Hex, Profile>> => {
  const { namesToOwnedPermRes, preflight, publicClient } = params
  if (namesToOwnedPermRes.length === 0 || preflight.skipFetchProfilesPhase) {
    return new Map()
  }
  return fetchV1Profiles({
    names: namesToOwnedPermRes
      .filter((n) => n.v1ResolverAddress)
      .map((n) => ({
        nodeHex: namehash(n.domain.name) as Hex,
        v1ResolverAddress: n.v1ResolverAddress as Address,
      })),
    publicClient,
  })
}

const computeNotReservedSet = async (
  publicClient: PublicClient,
  classified: readonly ClassifiedName[],
): Promise<Set<string>> => {
  const twoLDs = classified.filter(is2LD)
  if (twoLDs.length === 0) return new Set()
  const notReserved = await filterNotReserved(publicClient, twoLDs)
  return new Set(notReserved.map((n) => n.domain.name))
}

type SubnameParentResolution = {
  resolvedRegistries: Map<string, Address>
  deferredChildren: readonly ClassifiedName[]
  deferredParentNames: readonly string[]
}

const validateSubnameParents = async (
  publicClient: PublicClient,
  groups: GroupedNames,
  classified: readonly ClassifiedName[],
): Promise<SubnameParentResolution> => {
  if (groups.childNames.size === 0) {
    return {
      resolvedRegistries: new Map(),
      deferredChildren: [],
      deferredParentNames: [],
    }
  }

  const inPlanNames = new Set(classified.map((c) => c.domain.name))
  const { externalChildren, deferredChildren, deferredParentNames } =
    partitionChildrenByInPlan(groups.childNames, inPlanNames)

  const nested = findNestedDeferredParents(
    deferredChildren,
    deferredParentNames,
  )
  if (nested.length > 0) {
    throw new MigrationPlanError({
      cause: new Error(
        `Nested subname hierarchy not supported in a single migration: ${formatNamesPreview(nested)}. Migrate these parents first, then their children.`,
      ),
      step: 'Subnames',
    })
  }

  if (externalChildren.size === 0) {
    return {
      resolvedRegistries: new Map(),
      deferredChildren,
      deferredParentNames,
    }
  }

  const resolvedRegistries = await resolveParentRegistries(
    publicClient,
    externalChildren,
  )
  const unresolved = findUnresolvedParents(
    externalChildren,
    resolvedRegistries,
    zeroAddress,
  )
  if (unresolved.length === 0) {
    return { resolvedRegistries, deferredChildren, deferredParentNames }
  }

  const total = externalChildren.size
  const resolved = total - unresolved.length
  throw new MigrationPlanError({
    cause: new Error(
      `${unresolved.length}/${total} parent registries unresolved after retries: ${formatNamesPreview(unresolved)}. Migrate the parent name(s) first, or retry once the indexer catches up.`,
    ),
    step: `Subnames (${resolved}/${total} parents ready)`,
  })
}

export const buildMigrationPlan = async (params: {
  domains: readonly V1Domain[]
  migrationOwner: Address
  wagmiConfig: WagmiConfig
  publicClient: PublicClient
  preflight: MigrationPreflight
}): Promise<MigrationPlan> => {
  const { domains, migrationOwner, publicClient, preflight } = params

  const { classified, ineligible } = classifyNames([...domains], migrationOwner)
  const groups = groupClassifiedNames(classified)
  const namesToOwnedPermRes = classified.filter(
    (n) => n.resolverStrategy === 'to-owned-permres',
  )

  let ownedPermRes: Address | null = null
  if (namesToOwnedPermRes.length > 0) {
    ownedPermRes =
      preflight.preExistingOwnedPermRes ??
      (await predictOwnedPermResAddress({
        eoa: migrationOwner,
        publicClient,
      }))
  }

  const [profiles, notReservedSet, subnameResolution] = await Promise.all([
    fetchProfilesForNames({ namesToOwnedPermRes, preflight, publicClient }),
    computeNotReservedSet(publicClient, classified),
    validateSubnameParents(publicClient, groups, classified),
  ])
  const { resolvedRegistries, deferredChildren, deferredParentNames } =
    subnameResolution

  const { batches, deferredBatches } = packPlanBatches({
    phase1Names: computePhase1Names(classified, deferredChildren),
    deferredChildren,
    deferredParentNames,
    parentRegistries: resolvedRegistries,
    migrationOwner,
    defaultResolver: V2_CONTRACTS.ENSV2Resolver,
    ownedPermRes,
    notReservedSet,
    profiles,
    pack: packNamesByPayload,
  })

  const stepDescriptors = buildStepDescriptors(classified, groups, preflight, [
    ...batches.map((b) => b.length),
    ...deferredBatches.map((b) => b.length),
  ])

  return {
    migrationOwner,
    domains,
    classified,
    ineligible,
    groups,
    preflight,
    ownedPermRes,
    profiles,
    notReservedSet,
    parentRegistries: resolvedRegistries,
    batches,
    deferredChildren,
    deferredParentNames,
    deferredBatches,
    stepDescriptors,
  }
}

export const resolveDeferredBatches = async (params: {
  plan: MigrationPlan
  publicClient: PublicClient
}): Promise<NameBundle[][]> => {
  const { plan, publicClient } = params
  if (plan.deferredBatches.length === 0) return []

  const grouped = groupDeferredChildrenByParent(plan.deferredChildren)
  const resolved = await resolveParentRegistries(publicClient, grouped)

  const stillUnresolved = plan.deferredParentNames.filter(
    (parentName) => (resolved.get(parentName) ?? zeroAddress) === zeroAddress,
  )
  if (stillUnresolved.length > 0) {
    throw new MigrationPlanError({
      cause: new Error(
        `${stillUnresolved.length} parent registries still unresolved after parent migration: ${formatNamesPreview(stillUnresolved)}. Retry once the chain catches up.`,
      ),
      step: 'Subnames',
    })
  }

  const combinedRegistries = new Map<string, Address>([
    ...plan.parentRegistries,
    ...resolved,
  ])

  return plan.deferredBatches.map((batch) =>
    batch.map((bundle) =>
      buildNameBundle({
        name: bundle.name,
        migrationOwner: plan.migrationOwner,
        defaultResolver: V2_CONTRACTS.ENSV2Resolver,
        ownedPermRes: plan.ownedPermRes,
        notReservedSet: plan.notReservedSet,
        parentRegistries: combinedRegistries,
        profiles: plan.profiles,
      }),
    ),
  )
}

export const adjustPlanForRetry = (
  plan: MigrationPlan,
  migratedNames: readonly string[],
): MigrationPlan => {
  if (migratedNames.length === 0) return plan
  const migratedSet = new Set(migratedNames)
  const remainingClassified = plan.classified.filter(
    (c) => !migratedSet.has(c.domain.name),
  )
  const remainingDomains = plan.domains.filter((d) => !migratedSet.has(d.name))
  const remainingDeferredChildren = plan.deferredChildren.filter(
    (c) => !migratedSet.has(c.domain.name),
  )
  const remainingDeferredParentNames = collectDeferredParentNames(
    remainingDeferredChildren,
  )

  if (remainingClassified.length === 0) {
    return {
      ...plan,
      classified: [],
      domains: remainingDomains,
      batches: [],
      deferredChildren: [],
      deferredParentNames: [],
      deferredBatches: [],
      stepDescriptors: [],
    }
  }

  const groups = groupClassifiedNames(remainingClassified)
  const { batches, deferredBatches } = packPlanBatches({
    phase1Names: computePhase1Names(
      remainingClassified,
      remainingDeferredChildren,
    ),
    deferredChildren: remainingDeferredChildren,
    deferredParentNames: remainingDeferredParentNames,
    parentRegistries: plan.parentRegistries,
    migrationOwner: plan.migrationOwner,
    defaultResolver: V2_CONTRACTS.ENSV2Resolver,
    ownedPermRes: plan.ownedPermRes,
    notReservedSet: plan.notReservedSet,
    profiles: plan.profiles,
    pack: packNamesByPayload,
  })

  const stepDescriptors = buildStepDescriptors(
    remainingClassified,
    groups,
    plan.preflight,
    [...batches.map((b) => b.length), ...deferredBatches.map((b) => b.length)],
  )

  return {
    ...plan,
    classified: remainingClassified,
    domains: remainingDomains,
    groups,
    batches,
    deferredChildren: remainingDeferredChildren,
    deferredParentNames: remainingDeferredParentNames,
    deferredBatches,
    stepDescriptors,
  }
}
