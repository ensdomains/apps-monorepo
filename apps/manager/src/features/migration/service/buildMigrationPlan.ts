import { TaggedError } from '@ens-apps/utils/neverthrow'
import type { Config as WagmiConfig } from '@wagmi/core'
import type { Address, Hex, PublicClient } from 'viem'
import { zeroAddress } from 'viem'
import { V2_CONTRACTS } from '../contracts/addresses'
import {
  buildMigrationHelperCall,
  buildMigrationHelperPayload,
  emptyMigrationHelperPayload,
  type MigrationCall,
  type MigrationHelperPayload,
} from './buildMigrationCalls'
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
import type { Profile } from './fetchV1Profiles'
import {
  findUnresolvedParents,
  formatNamesPreview,
} from './migrationPlan.helpers'
import { resolveParentRegistries } from './preflightChecks'
import type { V1Domain } from './v1SubgraphClient'

export class MigrationPlanError extends TaggedError('MigrationPlanError')<{
  cause: unknown
  step?: string
}> {}

export type NameBundle = {
  name: ClassifiedName
  calls: MigrationCall[]
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
  deferredChildren: readonly ClassifiedName[]
  deferredParentNames: readonly string[]
  deferredBatches: readonly NameBundle[][]
  helperPayload: MigrationHelperPayload
  helperCall: MigrationCall
  stepDescriptors: readonly MigrationStepDescriptor[]
}

const validateSubnameParents = async (
  publicClient: PublicClient,
  groups: GroupedNames,
  classified: readonly ClassifiedName[],
): Promise<Map<string, Address>> => {
  if (groups.childNames.size === 0) return new Map()

  const inPlanNames = new Set(classified.map((c) => c.domain.name))
  const externalChildren = new Map<string, readonly ClassifiedName[]>()

  for (const [parentName, children] of groups.childNames) {
    if (!inPlanNames.has(parentName)) {
      externalChildren.set(parentName, children)
    }
  }

  if (externalChildren.size === 0) return new Map()

  const resolvedRegistries = await resolveParentRegistries(
    publicClient,
    externalChildren,
  )
  const unresolved = findUnresolvedParents(
    externalChildren,
    resolvedRegistries,
    zeroAddress,
  )
  if (unresolved.length === 0) return resolvedRegistries

  const total = externalChildren.size
  const resolved = total - unresolved.length
  throw new MigrationPlanError({
    cause: new Error(
      `${unresolved.length}/${total} parent registries unresolved after retries: ${formatNamesPreview(unresolved)}. Migrate the parent name(s) first, or retry once the indexer catches up.`,
    ),
    step: `Subnames (${resolved}/${total} parents ready)`,
  })
}

const buildHelperPayloadAndCall = (params: {
  classified: readonly ClassifiedName[]
  migrationOwner: Address
}): {
  helperPayload: MigrationHelperPayload
  helperCall: MigrationCall
} => {
  if (params.classified.length === 0) {
    const helperPayload = emptyMigrationHelperPayload()
    return {
      helperPayload,
      helperCall: buildMigrationHelperCall(helperPayload),
    }
  }

  const helperPayload = buildMigrationHelperPayload({
    classified: params.classified,
    migrationOwner: params.migrationOwner,
    defaultResolver: V2_CONTRACTS.ENSV2Resolver,
    ownedPermRes: null,
  })

  return {
    helperPayload,
    helperCall: buildMigrationHelperCall(helperPayload),
  }
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
  const parentRegistries = await validateSubnameParents(
    publicClient,
    groups,
    classified,
  )
  const { helperPayload, helperCall } = buildHelperPayloadAndCall({
    classified,
    migrationOwner,
  })
  const stepDescriptors = buildStepDescriptors(classified, groups, preflight)

  return {
    migrationOwner,
    domains,
    classified,
    ineligible,
    groups,
    preflight,
    ownedPermRes: null,
    profiles: new Map(),
    parentRegistries,
    batches: [],
    deferredChildren: [],
    deferredParentNames: [],
    deferredBatches: [],
    helperPayload,
    helperCall,
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
  const groups = groupClassifiedNames(remainingClassified)
  const { helperPayload, helperCall } = buildHelperPayloadAndCall({
    classified: remainingClassified,
    migrationOwner: plan.migrationOwner,
  })

  return {
    ...plan,
    classified: remainingClassified,
    domains: remainingDomains,
    groups,
    batches: [],
    deferredChildren: [],
    deferredParentNames: [],
    deferredBatches: [],
    helperPayload,
    helperCall,
    stepDescriptors: buildStepDescriptors(
      remainingClassified,
      groups,
      plan.preflight,
    ),
  }
}
