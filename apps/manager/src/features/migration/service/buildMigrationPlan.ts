import type { Call } from '@ens-apps/transaction-manager'
import { TaggedError } from '@ens-apps/utils/neverthrow'
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
  type GroupedNames,
  groupClassifiedNames,
  type IneligibleName,
} from './classifyNames'
import type { MigrationPreflight } from './computeMigrationPreflight'
import { predictOwnedPermResAddress } from './ensureOwnedPermRes'
import { fetchV1Profiles, type Profile, profileMapKey } from './fetchV1Profiles'
import type { V1Domain } from './v1SubgraphClient'

export class MigrationPlanError extends TaggedError('MigrationPlanError')<{
  cause: unknown
  step?: string
}> {}

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
    defaultResolver: V2_CONTRACTS.ENSV2Resolver,
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

  const { classified, ineligible } = classifyNames([...domains], migrationOwner)
  const groups = groupClassifiedNames(classified)
  const namesToOwnedPermRes = classified.filter(
    (n) => n.resolverStrategy === 'to-owned-permres',
  )

  let ownedPermRes: Address | null = null
  if (namesToOwnedPermRes.length > 0) {
    ownedPermRes =
      preflight.preExistingOwnedPermRes ??
      (await predictOwnedPermResAddress({ eoa: migrationOwner, publicClient }))
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
    roleGrantBatchCount: 0,
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
    roleGrantBatchCount: 0,
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
