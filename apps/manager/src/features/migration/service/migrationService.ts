import { TaggedError } from '@ens-apps/utils/neverthrow'
import {
  type Config as WagmiConfig,
  waitForTransactionReceipt,
  writeContract,
} from '@wagmi/core'
import type { Address, Hex, PublicClient } from 'viem'
import { zeroAddress } from 'viem'
import { readContract } from 'viem/actions'
import {
  ETH_REGISTRY_V2_ABI,
  NAME_WRAPPER_ABI,
  WRAPPER_REGISTRY_ABI,
} from '../contracts/abis'
import { V1_CONTRACTS, V2_CONTRACTS } from '../contracts/addresses'
import {
  buildUnwrappedCall,
  buildWrappedCalls,
  type MigrationCall,
} from './buildMigrationCalls'
import {
  type ClassifiedName,
  classifyNames,
  FUSES,
  type GroupedNames,
  groupClassifiedNames,
  hasFuse,
} from './classifyNames'
import type { V1Domain } from './v1SubgraphClient'

export class MigrationError extends TaggedError('MigrationError')<{
  cause: unknown
  step?: string
}> {}

export class MigrationUserRejectedError extends TaggedError(
  'MigrationUserRejectedError',
)<{
  step: string
}> {}

export type MigrationProgress = {
  currentStep: number
  totalSteps: number
  description: string
  txHash?: Hex
}

export type SkippedName = {
  name: string
  reason: 'not-premigrated' | 'frozen-approval'
}

export type MigrationResult = {
  completed: number
  txHashes: Hex[]
  skipped: SkippedName[]
}

type PreFlightResult = {
  valid: ClassifiedName[]
  notReserved: ClassifiedName[]
  frozen: ClassifiedName[]
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T,
): Promise<T> {
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
    ])
  } catch {
    return fallback
  }
}

const PREFLIGHT_TIMEOUT = 8000

// Checks if 2LD names are RESERVED in v2 ETHRegistry (resolver != zeroAddress).
// On timeout/error, names pass through and the contract validates instead.
async function filterNotReserved(
  publicClient: PublicClient,
  names: ClassifiedName[],
): Promise<{ valid: ClassifiedName[]; notReserved: ClassifiedName[] }> {
  const twoLDs = names.filter(
    (n) =>
      n.tokenType === 'unwrapped' ||
      n.tokenType === 'unlocked' ||
      n.tokenType === 'locked-2ld',
  )

  if (twoLDs.length === 0) {
    return { valid: names, notReserved: [] }
  }

  const notReserved: ClassifiedName[] = []

  for (const name of twoLDs) {
    const resolver = await withTimeout(
      readContract(publicClient, {
        address: V2_CONTRACTS.ETHRegistry,
        abi: ETH_REGISTRY_V2_ABI,
        functionName: 'getResolver',
        args: [name.label],
      }),
      PREFLIGHT_TIMEOUT,
      null,
    )

    if (resolver === null) continue
    if (resolver === zeroAddress) notReserved.push(name)
  }

  if (notReserved.length === 0) {
    return { valid: names, notReserved: [] }
  }

  const notReservedIds = new Set(notReserved.map((n) => n.domain.id))
  const valid = names.filter((n) => !notReservedIds.has(n.domain.id))
  return { valid, notReserved }
}

// Checks locked names with CANNOT_APPROVE for non-null getApproved() (FrozenTokenApproval).
// On timeout/error, names pass through and the contract validates instead.
async function filterFrozenApprovals(
  publicClient: PublicClient,
  names: ClassifiedName[],
): Promise<{ valid: ClassifiedName[]; frozen: ClassifiedName[] }> {
  const locked = names.filter(
    (n) =>
      (n.tokenType === 'locked-2ld' || n.tokenType === 'locked-child') &&
      hasFuse(n.fuses, FUSES.CANNOT_APPROVE),
  )

  if (locked.length === 0) {
    return { valid: names, frozen: [] }
  }

  const frozen: ClassifiedName[] = []

  for (const name of locked) {
    const tokenId = BigInt(name.domain.id)
    const approved = await withTimeout(
      readContract(publicClient, {
        address: V1_CONTRACTS.NameWrapper,
        abi: NAME_WRAPPER_ABI,
        functionName: 'getApproved',
        args: [tokenId],
      }),
      PREFLIGHT_TIMEOUT,
      null,
    )

    if (approved === null) continue
    if (approved !== zeroAddress) frozen.push(name)
  }

  if (frozen.length === 0) {
    return { valid: names, frozen: [] }
  }

  const frozenIds = new Set(frozen.map((n) => n.domain.id))
  const valid = names.filter((n) => !frozenIds.has(n.domain.id))
  return { valid, frozen }
}

async function runPreFlightChecks(
  publicClient: PublicClient,
  names: ClassifiedName[],
): Promise<PreFlightResult> {
  try {
    const reservedResult = await filterNotReserved(publicClient, names)
    const frozenResult = await filterFrozenApprovals(
      publicClient,
      reservedResult.valid,
    )

    return {
      valid: frozenResult.valid,
      notReserved: reservedResult.notReserved,
      frozen: frozenResult.frozen,
    }
  } catch {
    return { valid: names, notReserved: [], frozen: [] }
  }
}

async function getParentWrapperRegistry(
  publicClient: PublicClient,
  parentLabels: string[],
): Promise<Address> {
  let currentRegistry: Address = V2_CONTRACTS.ETHRegistry

  for (const label of parentLabels) {
    const subregistry = await readContract(publicClient, {
      address: currentRegistry,
      abi:
        currentRegistry === V2_CONTRACTS.ETHRegistry
          ? ETH_REGISTRY_V2_ABI
          : WRAPPER_REGISTRY_ABI,
      functionName: 'getSubregistry',
      args: [label],
    })

    if (subregistry === zeroAddress) return zeroAddress
    currentRegistry = subregistry as Address
  }

  return currentRegistry
}

// Returns labels from .eth downward: "sub.nick.eth" → ["nick"], "deep.sub.nick.eth" → ["nick", "sub"]
function getParentLabels(name: ClassifiedName): string[] {
  const fullParts = name.domain.name.split('.')
  const parentParts = fullParts.slice(1, -1)
  return parentParts.reverse()
}

function countSteps(groups: GroupedNames): number {
  let count = 0
  if (groups.unwrapped.length > 0) count++
  if (groups.unlocked.length > 0) count++
  if (groups.locked2ld.length > 0) count++
  count += groups.lockedChildren.size
  return count
}

async function executeCall(
  wagmiConfig: WagmiConfig,
  call: MigrationCall,
): Promise<Hex> {
  let hash: Hex
  switch (call.type) {
    case 'unwrapped':
      hash = await writeContract(wagmiConfig, call.request)
      break
    case 'wrapped-single':
      hash = await writeContract(wagmiConfig, call.request)
      break
    case 'wrapped-batch':
      hash = await writeContract(wagmiConfig, call.request)
      break
  }

  await waitForTransactionReceipt(wagmiConfig, { hash })
  return hash
}

function isUserRejection(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    return (
      msg.includes('user rejected') ||
      msg.includes('user denied') ||
      msg.includes('rejected the request')
    )
  }
  return false
}

export async function executeMigration(params: {
  domains: V1Domain[]
  migrationOwner: Address
  defaultResolver: Address
  wagmiConfig: WagmiConfig
  publicClient: PublicClient
  onProgress: (progress: MigrationProgress) => void
}): Promise<MigrationResult> {
  const {
    domains,
    migrationOwner,
    defaultResolver,
    wagmiConfig,
    publicClient,
    onProgress,
  } = params

  const classified = classifyNames(domains, migrationOwner)
  if (classified.length === 0) {
    return { completed: 0, txHashes: [], skipped: [] }
  }

  const preflight = await runPreFlightChecks(publicClient, classified)

  const skipped: SkippedName[] = [
    ...preflight.notReserved.map((n) => ({
      name: n.domain.name,
      reason: 'not-premigrated' as const,
    })),
    ...preflight.frozen.map((n) => ({
      name: n.domain.name,
      reason: 'frozen-approval' as const,
    })),
  ]

  if (preflight.valid.length === 0) {
    const reasons: string[] = []
    if (preflight.notReserved.length > 0) {
      const names = preflight.notReserved.map((n) => n.domain.name).join(', ')
      reasons.push(
        `Not yet premigrated in ENS v2: ${names}. These names must be premigrated before they can be migrated.`,
      )
    }
    if (preflight.frozen.length > 0) {
      const names = preflight.frozen.map((n) => n.domain.name).join(', ')
      reasons.push(
        `Frozen approval prevents migration: ${names}. These names have CANNOT_APPROVE with an active approval.`,
      )
    }
    throw new MigrationError({
      cause: new Error(reasons.join('\n')),
      step: 'Pre-flight checks',
    })
  }

  const validNames = preflight.valid

  const groups = groupClassifiedNames(validNames)
  const totalSteps = countSteps(groups)
  const txHashes: Hex[] = []
  let stepIndex = 0

  if (groups.unwrapped.length > 0) {
    onProgress({
      currentStep: stepIndex,
      totalSteps,
      description: `Migrating ${groups.unwrapped.length} unwrapped name(s)`,
    })

    for (const name of groups.unwrapped) {
      const call = buildUnwrappedCall({ name, migrationOwner, defaultResolver })

      try {
        const hash = await executeCall(wagmiConfig, call)
        txHashes.push(hash)
      } catch (error) {
        if (isUserRejection(error)) {
          throw new MigrationUserRejectedError({
            step: `Unwrapped: ${name.label}.eth`,
          })
        }
        throw new MigrationError({
          cause: error,
          step: `Unwrapped: ${name.label}.eth`,
        })
      }
    }

    stepIndex++
    onProgress({
      currentStep: stepIndex,
      totalSteps,
      description: 'Unwrapped names migrated',
      txHash: txHashes[txHashes.length - 1],
    })
  }

  if (groups.unlocked.length > 0) {
    onProgress({
      currentStep: stepIndex,
      totalSteps,
      description: `Migrating ${groups.unlocked.length} unlocked name(s)`,
    })

    const call = buildWrappedCalls({
      names: groups.unlocked,
      migrationOwner,
      defaultResolver,
      target: V2_CONTRACTS.UnlockedMigrationController,
    })

    try {
      const hash = await executeCall(wagmiConfig, call)
      txHashes.push(hash)
    } catch (error) {
      if (isUserRejection(error)) {
        throw new MigrationUserRejectedError({ step: 'Unlocked names' })
      }
      throw new MigrationError({ cause: error, step: 'Unlocked names' })
    }

    stepIndex++
    onProgress({
      currentStep: stepIndex,
      totalSteps,
      description: 'Unlocked names migrated',
      txHash: txHashes[txHashes.length - 1],
    })
  }

  if (groups.locked2ld.length > 0) {
    onProgress({
      currentStep: stepIndex,
      totalSteps,
      description: `Migrating ${groups.locked2ld.length} locked name(s)`,
    })

    const call = buildWrappedCalls({
      names: groups.locked2ld,
      migrationOwner,
      defaultResolver,
      target: V2_CONTRACTS.LockedMigrationController,
    })

    try {
      const hash = await executeCall(wagmiConfig, call)
      txHashes.push(hash)
    } catch (error) {
      if (isUserRejection(error)) {
        throw new MigrationUserRejectedError({ step: 'Locked names' })
      }
      throw new MigrationError({ cause: error, step: 'Locked names' })
    }

    stepIndex++
    onProgress({
      currentStep: stepIndex,
      totalSteps,
      description: 'Locked names migrated',
      txHash: txHashes[txHashes.length - 1],
    })
  }

  for (const [parentName, children] of groups.lockedChildren) {
    onProgress({
      currentStep: stepIndex,
      totalSteps,
      description: `Migrating subnames under ${parentName}`,
    })

    const firstChild = children[0]
    if (!firstChild) continue

    const parentLabels = getParentLabels(firstChild)

    let wrapperRegistry: Address
    try {
      wrapperRegistry = await getParentWrapperRegistry(
        publicClient,
        parentLabels,
      )
    } catch (error) {
      throw new MigrationError({
        cause: error,
        step: `Looking up registry for ${parentName}`,
      })
    }

    if (wrapperRegistry === zeroAddress) {
      throw new MigrationError({
        cause: new Error(
          `Parent "${parentName}" has not been migrated yet. Migrate the parent first.`,
        ),
        step: `Subnames under ${parentName}`,
      })
    }

    const call = buildWrappedCalls({
      names: children,
      migrationOwner,
      defaultResolver,
      target: wrapperRegistry,
    })

    try {
      const hash = await executeCall(wagmiConfig, call)
      txHashes.push(hash)
    } catch (error) {
      if (isUserRejection(error)) {
        throw new MigrationUserRejectedError({
          step: `Subnames under ${parentName}`,
        })
      }
      throw new MigrationError({
        cause: error,
        step: `Subnames under ${parentName}`,
      })
    }

    stepIndex++
    onProgress({
      currentStep: stepIndex,
      totalSteps,
      description: `Subnames under ${parentName} migrated`,
      txHash: txHashes[txHashes.length - 1],
    })
  }

  return { completed: validNames.length, txHashes, skipped }
}

export function getMigrationStepCount(
  domains: V1Domain[],
  ownerAddress: Address,
): number {
  const classified = classifyNames(domains, ownerAddress)
  const groups = groupClassifiedNames(classified)
  return countSteps(groups)
}

export function getMigrationStepDescriptions(
  domains: V1Domain[],
  ownerAddress: Address,
): string[] {
  const classified = classifyNames(domains, ownerAddress)
  const groups = groupClassifiedNames(classified)
  const descriptions: string[] = []

  if (groups.unwrapped.length > 0) {
    descriptions.push(`Migrating ${groups.unwrapped.length} unwrapped name(s)`)
  }
  if (groups.unlocked.length > 0) {
    descriptions.push(`Migrating ${groups.unlocked.length} unlocked name(s)`)
  }
  if (groups.locked2ld.length > 0) {
    descriptions.push(`Migrating ${groups.locked2ld.length} locked name(s)`)
  }
  for (const [parentName, children] of groups.lockedChildren) {
    descriptions.push(
      `Migrating ${children.length} subname(s) under ${parentName}`,
    )
  }

  return descriptions
}
