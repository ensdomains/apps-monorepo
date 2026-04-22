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

const calcBundleBytes = (calls: readonly ZeroDevCall[]): number => {
  let total = 0
  for (const c of calls) {
    total += Math.max(0, (c.data.length - 2) / 2)
    total += 64
  }
  return total
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
  const out = new Set<string>()
  for (const name of notReserved) out.add(name.domain.name)
  return out
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
  const empty: SubnameParentResolution = {
    resolvedRegistries: new Map(),
    deferredChildren: [],
    deferredParentNames: [],
  }
  if (groups.childNames.size === 0) return empty

  const inPlanNames = new Set(classified.map((c) => c.domain.name))
  const externalChildren = new Map<string, readonly ClassifiedName[]>()
  const deferredChildren: ClassifiedName[] = []
  const deferredParentNames: string[] = []

  for (const [parentName, children] of groups.childNames) {
    if (inPlanNames.has(parentName)) {
      deferredChildren.push(...children)
      deferredParentNames.push(parentName)
    } else {
      externalChildren.set(parentName, children)
    }
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

  const unresolvedParents: string[] = []
  for (const [parentName] of externalChildren) {
    const registry = resolvedRegistries.get(parentName) ?? zeroAddress
    if (registry === zeroAddress) unresolvedParents.push(parentName)
  }
  if (unresolvedParents.length === 0) {
    return { resolvedRegistries, deferredChildren, deferredParentNames }
  }

  const total = externalChildren.size
  const resolved = total - unresolvedParents.length
  const preview = unresolvedParents.slice(0, 3).join(', ')
  const suffix =
    unresolvedParents.length > 3
      ? ` (+${unresolvedParents.length - 3} more)`
      : ''
  throw new MigrationPlanError({
    cause: new Error(
      `${unresolvedParents.length}/${total} parent registries unresolved after retries: ${preview}${suffix}. Migrate the parent name(s) first, or retry once the indexer catches up.`,
    ),
    step: `Subnames (${resolved}/${total} parents ready)`,
  })
}

const DEFERRED_PARENT_PLACEHOLDER: Address =
  '0x00000000000000000000000000000000deadbeef'

const buildDeferredPlaceholderRegistries = (
  deferredParentNames: readonly string[],
): Map<string, Address> => {
  const map = new Map<string, Address>()
  for (const name of deferredParentNames) {
    map.set(name, DEFERRED_PARENT_PLACEHOLDER)
  }
  return map
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
    ownedPermRes = preflight.preExistingOwnedPermRes
    if (!ownedPermRes) {
      ownedPermRes = await predictOwnedPermResAddress({
        eoa: migrationOwner,
        publicClient,
      })
    }
  }

  const [profiles, notReservedSet, subnameResolution] = await Promise.all([
    fetchProfilesForNames({ namesToOwnedPermRes, preflight, publicClient }),
    computeNotReservedSet(publicClient, classified),
    validateSubnameParents(publicClient, groups, classified),
  ])
  const { resolvedRegistries, deferredChildren, deferredParentNames } =
    subnameResolution

  const deferredSet = new Set(deferredChildren.map((c) => c.domain.name))
  const phase1Classified = classified.filter(
    (c) => !deferredSet.has(c.domain.name),
  )

  const batches = packNamesByPayload({
    names: phase1Classified,
    migrationOwner,
    defaultResolver: V2_CONTRACTS.ENSV2Resolver,
    ownedPermRes,
    notReservedSet,
    parentRegistries: resolvedRegistries,
    profiles,
  })

  const deferredBatches =
    deferredChildren.length === 0
      ? []
      : packNamesByPayload({
          names: deferredChildren,
          migrationOwner,
          defaultResolver: V2_CONTRACTS.ENSV2Resolver,
          ownedPermRes,
          notReservedSet,
          parentRegistries:
            buildDeferredPlaceholderRegistries(deferredParentNames),
          profiles,
        })

  const combinedBatchSizes = [
    ...batches.map((b) => b.length),
    ...deferredBatches.map((b) => b.length),
  ]
  const stepDescriptors = buildStepDescriptors(
    classified,
    groups,
    preflight,
    combinedBatchSizes,
  )

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

const groupDeferredChildrenByParent = (
  children: readonly ClassifiedName[],
): Map<string, readonly ClassifiedName[]> => {
  const map = new Map<string, ClassifiedName[]>()
  for (const child of children) {
    if (!child.parentName) continue
    const list = map.get(child.parentName) ?? []
    list.push(child)
    map.set(child.parentName, list)
  }
  return map as Map<string, readonly ClassifiedName[]>
}

export const resolveDeferredBatches = async (params: {
  plan: MigrationPlan
  publicClient: PublicClient
}): Promise<NameBundle[][]> => {
  const { plan, publicClient } = params
  if (plan.deferredBatches.length === 0) return []

  const grouped = groupDeferredChildrenByParent(plan.deferredChildren)
  const resolved = await resolveParentRegistries(publicClient, grouped)

  const stillUnresolved: string[] = []
  for (const parentName of plan.deferredParentNames) {
    const addr = resolved.get(parentName) ?? zeroAddress
    if (addr === zeroAddress) stillUnresolved.push(parentName)
  }
  if (stillUnresolved.length > 0) {
    const preview = stillUnresolved.slice(0, 3).join(', ')
    const suffix =
      stillUnresolved.length > 3 ? ` (+${stillUnresolved.length - 3} more)` : ''
    throw new MigrationPlanError({
      cause: new Error(
        `${stillUnresolved.length} parent registries still unresolved after parent migration: ${preview}${suffix}. Retry once the chain catches up.`,
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
  const remainingDeferredParentNames = [
    ...new Set(
      remainingDeferredChildren
        .map((c) => c.parentName)
        .filter((n): n is string => n !== null),
    ),
  ]

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
  const deferredSet = new Set(
    remainingDeferredChildren.map((c) => c.domain.name),
  )
  const phase1Remaining = remainingClassified.filter(
    (c) => !deferredSet.has(c.domain.name),
  )

  const batches = packNamesByPayload({
    names: phase1Remaining,
    migrationOwner: plan.migrationOwner,
    defaultResolver: V2_CONTRACTS.ENSV2Resolver,
    ownedPermRes: plan.ownedPermRes,
    notReservedSet: plan.notReservedSet,
    parentRegistries: plan.parentRegistries,
    profiles: plan.profiles,
  })

  const deferredBatches =
    remainingDeferredChildren.length === 0
      ? []
      : packNamesByPayload({
          names: remainingDeferredChildren,
          migrationOwner: plan.migrationOwner,
          defaultResolver: V2_CONTRACTS.ENSV2Resolver,
          ownedPermRes: plan.ownedPermRes,
          notReservedSet: plan.notReservedSet,
          parentRegistries: buildDeferredPlaceholderRegistries(
            remainingDeferredParentNames,
          ),
          profiles: plan.profiles,
        })

  const combinedBatchSizes = [
    ...batches.map((b) => b.length),
    ...deferredBatches.map((b) => b.length),
  ]
  const stepDescriptors = buildStepDescriptors(
    remainingClassified,
    groups,
    plan.preflight,
    combinedBatchSizes,
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
