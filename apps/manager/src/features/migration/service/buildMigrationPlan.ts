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
} from './classifyNames'
import type { MigrationPreflight } from './computeMigrationPreflight'
import { predictOwnedPermResAddress } from './ensureOwnedPermRes'
import { fetchV1Profiles, type Profile, profileMapKey } from './fetchV1Profiles'
import { resolveParentRegistries } from './preflightChecks'
import type { V1Domain } from './v1SubgraphClient'

export const MAX_BATCH_RAW_BYTES = 80_000

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
  parentRegistries: ReadonlyMap<string, Address>
  batches: readonly NameBundle[][]
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

const buildNameBundle = (params: {
  name: ClassifiedName
  migrationOwner: Address
  defaultResolver: Address
  ownedPermRes: Address | null
  parentRegistries: ReadonlyMap<string, Address>
  profiles: ReadonlyMap<Hex, Profile>
}): NameBundle => {
  const {
    name,
    migrationOwner,
    defaultResolver,
    ownedPermRes,
    parentRegistries,
    profiles,
  } = params
  const calls: ZeroDevCall[] = []

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

const validateSubnameParents = async (
  publicClient: PublicClient,
  groups: GroupedNames,
): Promise<Map<string, Address>> => {
  if (groups.childNames.size === 0) return new Map()

  const parentRegistries = await resolveParentRegistries(
    publicClient,
    groups.childNames,
  )

  const unresolvedParents: string[] = []
  for (const [parentName] of groups.childNames) {
    const registry = parentRegistries.get(parentName) ?? zeroAddress
    if (registry === zeroAddress) unresolvedParents.push(parentName)
  }
  if (unresolvedParents.length === 0) return parentRegistries

  const total = groups.childNames.size
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

  const [profiles, parentRegistries] = await Promise.all([
    fetchProfilesForNames({ namesToOwnedPermRes, preflight, publicClient }),
    validateSubnameParents(publicClient, groups),
  ])

  const batches = packNamesByPayload({
    names: classified,
    migrationOwner,
    defaultResolver: V2_CONTRACTS.ENSV2Resolver,
    ownedPermRes,
    parentRegistries,
    profiles,
  })

  const stepDescriptors = buildStepDescriptors(
    classified,
    groups,
    preflight,
    batches.map((b) => b.length),
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
    parentRegistries,
    batches,
    stepDescriptors,
  }
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

  if (remainingClassified.length === 0) {
    return {
      ...plan,
      classified: [],
      domains: remainingDomains,
      batches: [],
      stepDescriptors: [],
    }
  }

  const groups = groupClassifiedNames(remainingClassified)
  const batches = packNamesByPayload({
    names: remainingClassified,
    migrationOwner: plan.migrationOwner,
    defaultResolver: V2_CONTRACTS.ENSV2Resolver,
    ownedPermRes: plan.ownedPermRes,
    parentRegistries: plan.parentRegistries,
    profiles: plan.profiles,
  })
  const stepDescriptors = buildStepDescriptors(
    remainingClassified,
    groups,
    plan.preflight,
    batches.map((b) => b.length),
  )

  return {
    ...plan,
    classified: remainingClassified,
    domains: remainingDomains,
    groups,
    batches,
    stepDescriptors,
  }
}
