import type { ZeroDevCall } from '@ens-apps/transaction-manager'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import type { Config as WagmiConfig } from '@wagmi/core'
import { type Address, type Hex, namehash, type PublicClient } from 'viem'

import { V2_CONTRACTS } from '../contracts/addresses'
import { buildMigrateCall } from './buildMigrateCall'
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
  readonly migrateCall: ZeroDevCall
  readonly roleGrantCalls: readonly ZeroDevCall[]
  readonly profileReplayCalls: readonly ZeroDevCall[]
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

const buildAuxCalls = (params: {
  classified: readonly ClassifiedName[]
  ownedPermRes: Address | null
  profiles: ReadonlyMap<Hex, Profile>
}): {
  roleGrantCalls: ZeroDevCall[]
  profileReplayCalls: ZeroDevCall[]
} => {
  const { classified, ownedPermRes, profiles } = params
  const roleGrantCalls: ZeroDevCall[] = []
  const replayProfiles = new Map<Hex, Profile>()

  for (const name of classified) {
    if (name.managerAddress) {
      roleGrantCalls.push(buildRoleGrantCall(name))
    }
    if (ownedPermRes && name.resolverStrategy === 'to-owned-permres') {
      const node = namehash(name.domain.name) as Hex
      const profile = profiles.get(profileMapKey(node))
      if (
        profile &&
        (profile.texts.length > 0 || profile.addresses.length > 0)
      ) {
        replayProfiles.set(node, profile)
      }
    }
  }

  const profileReplayCalls: ZeroDevCall[] = []
  if (ownedPermRes && replayProfiles.size > 0) {
    const replayCall = buildProfileReplayCall({
      resolver: ownedPermRes,
      profiles: replayProfiles,
    })
    if (replayCall) profileReplayCalls.push(replayCall)
  }

  return { roleGrantCalls, profileReplayCalls }
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

  const migrateCall = buildMigrateCall({
    classified,
    migrationOwner,
    defaultResolver: V2_CONTRACTS.ENSV2Resolver,
    ownedPermRes,
  })

  const { roleGrantCalls, profileReplayCalls } = buildAuxCalls({
    classified,
    ownedPermRes,
    profiles,
  })

  const stepDescriptors = buildStepDescriptors({
    classified,
    groups,
    preflight,
    hasBaseRegistrarApproval,
    hasNameWrapperApproval,
    hasProfileReplay: profileReplayCalls.length > 0,
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
    migrateCall,
    roleGrantCalls,
    profileReplayCalls,
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
      roleGrantCalls: [],
      profileReplayCalls: [],
      stepDescriptors: [],
    }
  }

  const groups = groupClassifiedNames(remainingClassified)
  const migrateCall = buildMigrateCall({
    classified: remainingClassified,
    migrationOwner: plan.migrationOwner,
    defaultResolver: V2_CONTRACTS.ENSV2Resolver,
    ownedPermRes: plan.ownedPermRes,
  })
  const { roleGrantCalls, profileReplayCalls } = buildAuxCalls({
    classified: remainingClassified,
    ownedPermRes: plan.ownedPermRes,
    profiles: plan.profiles,
  })
  const stepDescriptors = buildStepDescriptors({
    classified: remainingClassified,
    groups,
    preflight: plan.preflight,
    hasBaseRegistrarApproval: true,
    hasNameWrapperApproval: true,
    hasProfileReplay: profileReplayCalls.length > 0,
  })

  return {
    ...plan,
    classified: remainingClassified,
    domains: remainingDomains,
    groups,
    migrateCall,
    roleGrantCalls,
    profileReplayCalls,
    stepDescriptors,
  }
}
