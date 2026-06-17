import type { Call } from '@ens-apps/transaction-manager'
import type { Config as WagmiConfig } from '@wagmi/core'
import { type Address, type Hex, namehash, type PublicClient } from 'viem'

import { V2_CONTRACTS } from '../contracts/addresses'
import { buildBatchedMigrateCalls, type MigrationBatch } from './batchMigrate'
import { buildBatchedProfileReplayCalls } from './batchProfileReplay'
import { buildRoleGrantCall } from './buildRoleGrantCalls'
import {
  buildStepDescriptors,
  type MigrationStepDescriptor,
} from './buildStepDescriptors'
import {
  type ClassifiedName,
  classifyNames,
  FUSES,
  type GroupedNames,
  groupClassifiedNames,
  hasFuse,
  type IneligibleName,
} from './classifyNames'
import type { MigrationPreflight } from './computeMigrationPreflight'
import { predictOwnedPermResAddress } from './ensureOwnedPermRes'
import { fetchV1Profiles, type Profile, profileMapKey } from './fetchV1Profiles'
import { getV1ProfileKeys, type V1Domain } from './v1SubgraphClient'

export type MigrationPlan = {
  readonly migrationOwner: Address
  readonly domains: readonly V1Domain[]
  readonly classified: readonly ClassifiedName[]
  readonly ineligible: readonly IneligibleName[]
  readonly groups: GroupedNames
  readonly preflight: MigrationPreflight
  readonly ownedPermRes: Address | null
  readonly profiles: ReadonlyMap<Hex, Profile>
  readonly migrateCalls: readonly Call[]
  readonly roleGrantCalls: readonly Call[]
  readonly profileReplayCalls: readonly Call[]
  readonly batches: readonly MigrationBatch[]
  readonly stepDescriptors: readonly MigrationStepDescriptor[]
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
    profileKeys: preflight.profileKeys,
  })
}

const buildReplayProfiles = (params: {
  classified: readonly ClassifiedName[]
  ownedPermRes: Address | null
  profiles: ReadonlyMap<Hex, Profile>
}): Map<Hex, Profile> => {
  const replay = new Map<Hex, Profile>()
  if (!params.ownedPermRes) return replay
  for (const n of params.classified) {
    if (n.resolverStrategy !== 'to-owned-permres') continue
    const node = namehash(n.domain.name) as Hex
    const profile = params.profiles.get(profileMapKey(node))
    if (profile && (profile.texts.length > 0 || profile.addresses.length > 0)) {
      replay.set(node, profile)
    }
  }
  return replay
}

const isResolverReplaceableWhenProfileEmpty = (
  name: ClassifiedName,
): boolean => {
  if (name.resolverStrategy !== 'keep-v1') return false
  if (!name.v1ResolverAddress) return false

  const cannotSetResolverLocked =
    (name.tokenType === 'locked-2ld' || name.tokenType === 'locked-child') &&
    hasFuse(name.fuses, FUSES.CANNOT_SET_RESOLVER)

  return !cannotSetResolverLocked
}

const routeEmptyProfilesToOwnedPermRes = async (
  classified: readonly ClassifiedName[],
): Promise<readonly ClassifiedName[]> => {
  const candidates = classified.filter(isResolverReplaceableWhenProfileEmpty)
  if (candidates.length === 0) return classified

  const result = await getV1ProfileKeys(candidates.map((n) => n.domain.id))
  if (result.isErr()) {
    console.warn(
      '[migration] getV1ProfileKeys failed while checking empty custom resolvers; preserving existing resolvers:',
      result.error,
    )
    return classified
  }

  const emptyProfileIds = new Set(
    result.value
      .filter((keys) => keys.texts.length === 0 && keys.coinTypes.length === 0)
      .map((keys) => keys.id.toLowerCase()),
  )

  if (emptyProfileIds.size === 0) return classified

  return classified.map((name) =>
    emptyProfileIds.has(name.domain.id.toLowerCase())
      ? { ...name, resolverStrategy: 'to-owned-permres' as const }
      : name,
  )
}

const assemblePlanParts = (params: {
  classified: readonly ClassifiedName[]
  migrationOwner: Address
  ownedPermRes: Address | null
  profiles: ReadonlyMap<Hex, Profile>
}): {
  migrateCalls: readonly Call[]
  batches: readonly MigrationBatch[]
  roleGrantCalls: readonly Call[]
  profileReplayCalls: readonly Call[]
} => {
  const { classified, migrationOwner, ownedPermRes, profiles } = params

  const { calls: migrateCalls, batches } = buildBatchedMigrateCalls({
    classified,
    migrationOwner,
    defaultResolver: V2_CONTRACTS.DefaultResolver,
    ownedPermRes,
  })

  const roleGrantCalls: Call[] = []
  for (const n of classified) {
    if (n.managerAddress) roleGrantCalls.push(buildRoleGrantCall(n))
  }

  const replay = buildReplayProfiles({ classified, ownedPermRes, profiles })
  const profileReplayCalls = ownedPermRes
    ? buildBatchedProfileReplayCalls({
        resolver: ownedPermRes,
        profiles: replay,
      })
    : []

  return { migrateCalls, batches, roleGrantCalls, profileReplayCalls }
}

export const buildMigrationPlan = async (params: {
  domains: readonly V1Domain[]
  migrationOwner: Address
  wagmiConfig: WagmiConfig
  publicClient: PublicClient
  preflight: MigrationPreflight
  hasBaseRegistrarApproval: boolean
  hasNameWrapperApproval: boolean
}): Promise<MigrationPlan> => {
  const {
    domains,
    migrationOwner,
    publicClient,
    preflight,
    hasBaseRegistrarApproval,
    hasNameWrapperApproval,
  } = params

  const classifiedNamesResult = classifyNames([...domains], migrationOwner)
  const classified = await routeEmptyProfilesToOwnedPermRes(
    classifiedNamesResult.classified,
  )
  const { ineligible } = classifiedNamesResult
  const groups = groupClassifiedNames([...classified])
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

  const profiles = await fetchProfilesForNames({
    namesToOwnedPermRes,
    preflight,
    publicClient,
  })

  const parts = assemblePlanParts({
    classified,
    migrationOwner,
    ownedPermRes,
    profiles,
  })

  const stepDescriptors = buildStepDescriptors({
    classified,
    groups,
    preflight,
    hasBaseRegistrarApproval,
    hasNameWrapperApproval,
    hasProfileReplay: parts.profileReplayCalls.length > 0,
    migrateBatchCount: parts.migrateCalls.length,
    profileReplayBatchCount: parts.profileReplayCalls.length,
  })

  return {
    migrationOwner,
    domains,
    classified,
    ineligible,
    groups,
    preflight,
    ownedPermRes,
    profiles,
    migrateCalls: parts.migrateCalls,
    roleGrantCalls: parts.roleGrantCalls,
    profileReplayCalls: parts.profileReplayCalls,
    batches: parts.batches,
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
      migrateCalls: [],
      roleGrantCalls: [],
      profileReplayCalls: [],
      batches: [],
      stepDescriptors: [],
    }
  }

  const groups = groupClassifiedNames(remainingClassified)
  const parts = assemblePlanParts({
    classified: remainingClassified,
    migrationOwner: plan.migrationOwner,
    ownedPermRes: plan.ownedPermRes,
    profiles: plan.profiles,
  })

  const stepDescriptors = buildStepDescriptors({
    classified: remainingClassified,
    groups,
    preflight: plan.preflight,
    hasBaseRegistrarApproval: true,
    hasNameWrapperApproval: true,
    hasProfileReplay: parts.profileReplayCalls.length > 0,
    migrateBatchCount: parts.migrateCalls.length,
    profileReplayBatchCount: parts.profileReplayCalls.length,
  })

  return {
    ...plan,
    classified: remainingClassified,
    domains: remainingDomains,
    groups,
    migrateCalls: parts.migrateCalls,
    roleGrantCalls: parts.roleGrantCalls,
    profileReplayCalls: parts.profileReplayCalls,
    batches: parts.batches,
    stepDescriptors,
  }
}
