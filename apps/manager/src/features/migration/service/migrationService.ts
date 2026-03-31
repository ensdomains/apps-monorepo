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

// --- Error types ---

export class MigrationError extends TaggedError('MigrationError')<{
  cause: unknown
  step?: string
}> {}

export class MigrationUserRejectedError extends TaggedError(
  'MigrationUserRejectedError',
)<{
  step: string
}> {}

// --- Progress tracking ---

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

// --- Pre-flight checks ---

export type PreFlightResult = {
  valid: ClassifiedName[]
  notReserved: ClassifiedName[]
  frozen: ClassifiedName[]
}

/** Race a promise against a timeout. Returns fallback on timeout or error. */
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

/**
 * Verify names are RESERVED (premigrated) in the v2 ETHRegistry.
 *
 * Per the spec, premigration sets every ENSv1 name as RESERVED in ETHRegistry
 * with a resolver pointing to ENSV1Resolver. If the resolver is zero, the name
 * hasn't been premigrated and migration will fail with an authorization error.
 *
 * If the check fails or times out, names pass through (let the contract validate).
 */
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
    // Use a sentinel value to detect timeout/error — null means "skip check"
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

    // null = check failed/timed out, let the contract validate instead
    if (resolver === null) continue

    if (resolver === zeroAddress) {
      notReserved.push(name)
    }
  }

  if (notReserved.length === 0) {
    return { valid: names, notReserved: [] }
  }

  const notReservedIds = new Set(notReserved.map((n) => n.domain.id))
  const valid = names.filter((n) => !notReservedIds.has(n.domain.id))
  return { valid, notReserved }
}

/**
 * Check locked names for FrozenTokenApproval condition.
 *
 * Per the spec: if CANNOT_APPROVE is burned AND getApproved() is non-null,
 * the migration will revert with FrozenTokenApproval. We check this upfront.
 *
 * If the check fails or times out, names pass through (let the contract validate).
 */
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

    // null = check failed/timed out, let the contract validate
    if (approved === null) continue

    if (approved !== zeroAddress) {
      frozen.push(name)
    }
  }

  if (frozen.length === 0) {
    return { valid: names, frozen: [] }
  }

  const frozenIds = new Set(frozen.map((n) => n.domain.id))
  const valid = names.filter((n) => !frozenIds.has(n.domain.id))
  return { valid, frozen }
}

/**
 * Run all pre-flight checks on classified names.
 * Defensive: if any check fails or times out, affected names pass through.
 */
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
    // If pre-flight checks fail entirely, skip them and let contracts validate
    return { valid: names, notReserved: [], frozen: [] }
  }
}

// --- Subregistry lookup ---

/**
 * Look up the WrapperRegistry address for a locked parent name.
 * Traverses the v2 registry chain from ETHRegistry downward.
 * Returns zeroAddress if any parent in the chain hasn't been migrated yet.
 */
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

    if (subregistry === zeroAddress) {
      return zeroAddress
    }

    currentRegistry = subregistry as Address
  }

  return currentRegistry
}

/**
 * Parse parent labels from a classified name for registry traversal.
 * Returns labels from .eth downward to the immediate parent.
 *
 * e.g. "sub.nick.eth" → ["nick"]
 *      "deep.sub.nick.eth" → ["nick", "sub"]
 */
function getParentLabels(name: ClassifiedName): string[] {
  const fullParts = name.domain.name.split('.')
  // Remove the name's own label (first) and "eth" suffix (last)
  const parentParts = fullParts.slice(1, -1)
  // Reverse to traverse from .eth downward
  return parentParts.reverse()
}

// --- Step count calculation ---

function countSteps(groups: GroupedNames): number {
  let count = 0
  if (groups.unwrapped.length > 0) count++
  if (groups.unlocked.length > 0) count++
  if (groups.locked2ld.length > 0) count++
  count += groups.lockedChildren.size
  return count
}

// --- Transaction execution helpers ---

async function executeCall(
  wagmiConfig: WagmiConfig,
  call: MigrationCall,
): Promise<Hex> {
  // writeContract's generic signature makes direct union typing difficult,
  // so we narrow by call type to preserve ABI-level type safety
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

// --- Main execution ---

/**
 * Execute the full migration for a set of V1 domains.
 *
 * Flow:
 * 1. Classify and group names by migration type
 * 2. Pre-flight: filter out names with FrozenTokenApproval (CANNOT_APPROVE + non-null approval)
 * 3. Execute sequentially:
 *    a. Unwrapped names → individual BaseRegistrar.safeTransferFrom (ERC-721)
 *    b. Unlocked names → batch NameWrapper.safeBatchTransferFrom → UnlockedMigrationController
 *    c. Locked 2LD names → batch NameWrapper.safeBatchTransferFrom → LockedMigrationController
 *    d. Locked children → per-parent batch → parent's WrapperRegistry
 * 4. Report progress via callback
 *
 * All transactions are sent from the connected EOA wallet which owns the V1 tokens.
 */
export async function executeMigration(params: {
  domains: V1Domain[]
  /** The address to receive names in v2 (and used for subgraph ownership check) */
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

  // Classify and filter (uses migrationOwner for ownership matching)
  const classified = classifyNames(domains, migrationOwner)
  if (classified.length === 0) {
    return { completed: 0, txHashes: [], skipped: [] }
  }

  // Pre-flight checks: verify premigration status and approval state
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

  // Throw descriptive error if ALL names failed pre-flight
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

  // Step: Migrate unwrapped names (individual ERC-721 transfers)
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

  // Step: Migrate unlocked names (batch ERC-1155 transfer)
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

  // Step: Migrate locked 2LD names (batch ERC-1155 transfer)
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

  // Step: Migrate locked children (per-parent batch)
  for (const [parentName, children] of groups.lockedChildren) {
    onProgress({
      currentStep: stepIndex,
      totalSteps,
      description: `Migrating subnames under ${parentName}`,
    })

    // Resolve parent WrapperRegistry by traversing the v2 registry chain
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

/**
 * Pre-compute the number of migration steps for a set of domains.
 * Useful for setting up progress UI before starting migration.
 */
export function getMigrationStepCount(
  domains: V1Domain[],
  ownerAddress: Address,
): number {
  const classified = classifyNames(domains, ownerAddress)
  const groups = groupClassifiedNames(classified)
  return countSteps(groups)
}

/**
 * Get step descriptions for migration progress UI.
 */
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
