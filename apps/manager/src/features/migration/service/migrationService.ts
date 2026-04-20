import {
  type Signer,
  type TransactionRequest,
  transactionManager,
  waitForTransaction,
  type ZeroDevCall,
} from '@ens-apps/transaction-manager'
import { TaggedError } from '@ens-apps/utils/neverthrow'
import {
  readContract,
  type Config as WagmiConfig,
  waitForTransactionReceipt,
  writeContract,
} from '@wagmi/core'
import type { Address, Hex, PublicClient } from 'viem'
import { namehash, zeroAddress } from 'viem'
import { customSepolia } from '@/lib/wagmi'
import { BASE_REGISTRAR_ABI, NAME_WRAPPER_ABI } from '../contracts/abis'
import { V1_CONTRACTS } from '../contracts/addresses'
import { buildAllTransferCalls } from './buildMigrationCalls'
import { buildPreMigrateCalls } from './buildPreMigrateCalls'
import { buildProfileReplayCall } from './buildProfileReplayCalls'
import { buildRoleGrantCalls } from './buildRoleGrantCalls'
import {
  type ClassifiedName,
  classifyNames,
  type GroupedNames,
  groupClassifiedNames,
  type IneligibleName,
  is2LD,
} from './classifyNames'
import {
  EMPTY_PREFLIGHT,
  type MigrationPreflight,
} from './computeMigrationPreflight'
import { ensureOwnedPermRes } from './ensureOwnedPermRes'
import { fetchV1Profiles, type Profile } from './fetchV1Profiles'
import { filterNotReserved, resolveParentRegistries } from './preflightChecks'
import type { V1Domain } from './v1SubgraphClient'

const MAX_NAMES_PER_BATCH = 50

class MigrationError extends TaggedError('MigrationError')<{
  cause: unknown
  step?: string
}> {}

class MigrationUserRejectedError extends TaggedError(
  'MigrationUserRejectedError',
)<{
  step: string
}> {}

export type { MigrationPreflight } from './computeMigrationPreflight'
export { OwnedResolverDeployError } from './ensureOwnedPermRes'
export { ProfileFetchError } from './fetchV1Profiles'

export type MigrationProgress = {
  readonly currentStep: number
  readonly totalSteps: number
  readonly description: string
  readonly txHash?: Hex
}

export type MigrationResult = {
  readonly completed: number
  readonly txHashes: readonly Hex[]
  readonly ineligible: readonly IneligibleName[]
  readonly migratedNames: readonly string[]
}

export type MigrationStepDescriptor =
  | { type: 'approve-sca'; count: number }
  | { type: 'ensure-resolver' }
  | {
      type: 'migrate-batch'
      batch: number
      totalBatches: number
      count: number
    }

type Tracker = {
  emit: (description: string, txHash?: Hex) => void
  next: () => void
}

const createTracker = (
  onProgress: (progress: MigrationProgress) => void,
  totalSteps: number,
): Tracker => {
  let currentStep = 0
  return {
    emit(description, txHash) {
      onProgress({ currentStep, totalSteps, description, txHash })
    },
    next() {
      currentStep++
    },
  }
}

type MigrationCtx = {
  wagmiConfig: WagmiConfig
  publicClient: PublicClient
  signer: Signer
  accountAddress: Address
  migrationOwner: Address
  defaultResolver: Address
  tracker: Tracker
}

const approveSCAIfNeeded = async (
  ctx: MigrationCtx,
  groups: GroupedNames,
): Promise<Hex[]> => {
  const hashes: Hex[] = []
  const hasUnwrapped = groups.unwrapped.length > 0
  const hasWrapped =
    groups.unlocked.length > 0 ||
    groups.locked2ld.length > 0 ||
    groups.childNames.size > 0

  if (hasUnwrapped) {
    const isApproved = (await readContract(ctx.wagmiConfig, {
      address: V1_CONTRACTS.BaseRegistrar,
      abi: BASE_REGISTRAR_ABI,
      functionName: 'isApprovedForAll',
      args: [ctx.migrationOwner, ctx.accountAddress],
    })) as boolean

    if (!isApproved) {
      ctx.tracker.emit(
        'Approving your smart account on BaseRegistrar',
        PENDING_TX_HASH,
      )
      const hash = await writeContract(ctx.wagmiConfig, {
        address: V1_CONTRACTS.BaseRegistrar,
        abi: BASE_REGISTRAR_ABI,
        functionName: 'setApprovalForAll',
        args: [ctx.accountAddress, true],
      })
      await waitForTransactionReceipt(ctx.wagmiConfig, {
        hash,
        timeout: 300_000,
      })
      hashes.push(hash)
    }
  }

  if (hasWrapped) {
    const isApproved = (await readContract(ctx.wagmiConfig, {
      address: V1_CONTRACTS.NameWrapper,
      abi: NAME_WRAPPER_ABI,
      functionName: 'isApprovedForAll',
      args: [ctx.migrationOwner, ctx.accountAddress],
    })) as boolean

    if (!isApproved) {
      ctx.tracker.emit(
        'Approving your smart account on NameWrapper',
        PENDING_TX_HASH,
      )
      const hash = await writeContract(ctx.wagmiConfig, {
        address: V1_CONTRACTS.NameWrapper,
        abi: NAME_WRAPPER_ABI,
        functionName: 'setApprovalForAll',
        args: [ctx.accountAddress, true],
      })
      await waitForTransactionReceipt(ctx.wagmiConfig, {
        hash,
        timeout: 300_000,
      })
      hashes.push(hash)
    }
  }

  ctx.tracker.next()
  if (hashes.length > 0) {
    ctx.tracker.emit('Smart account approved')
  }
  return hashes
}

const buildSCARequest = (
  ctx: MigrationCtx,
  calls: ZeroDevCall[],
): TransactionRequest => {
  const firstCall = calls[0]
  if (!firstCall) throw new Error('No calls to submit')

  if (ctx.signer.type === 'zerodev') {
    return {
      type: 'zerodev',
      from: ctx.accountAddress,
      to: firstCall.to,
      data: firstCall.data,
      value: 0n,
      chainId: customSepolia.id,
      zerodevParams: {
        calls,
        sponsored: true,
      },
    } as TransactionRequest
  }

  return {
    type: 'rhinestone-intent',
    from: ctx.accountAddress,
    to: firstCall.to,
    data: firstCall.data,
    value: 0n,
    chainId: customSepolia.id,
    rhinestoneParams: {
      calls,
      sponsored: true,
    },
  } as TransactionRequest
}

const PENDING_TX_HASH = '0x0' as Hex

const submitBatchedUserOp = async (
  ctx: MigrationCtx,
  calls: ZeroDevCall[],
  description: string,
): Promise<Hex> => {
  const request = buildSCARequest(ctx, calls)

  const txId = transactionManager.startTransaction(
    { type: 'custom', request },
    ctx.signer,
    {
      description,
      publicClient: ctx.publicClient,
    },
  )

  ctx.tracker.emit(description, PENDING_TX_HASH)

  const result = await waitForTransaction(txId)
  return result.hash as Hex
}

const needsSCAApproval = (groups: GroupedNames): boolean =>
  groups.unwrapped.length > 0 ||
  groups.unlocked.length > 0 ||
  groups.locked2ld.length > 0 ||
  groups.childNames.size > 0

const getBatchCount = (nameCount: number): number =>
  Math.ceil(nameCount / MAX_NAMES_PER_BATCH)

const chunkArray = <T>(arr: readonly T[], size: number): T[][] => {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

const buildStepDescriptors = (
  classified: readonly ClassifiedName[],
  groups: GroupedNames,
  preflight: MigrationPreflight,
): MigrationStepDescriptor[] => {
  const descriptors: MigrationStepDescriptor[] = []

  if (needsSCAApproval(groups) && !preflight.skipApprovalPhase) {
    descriptors.push({ type: 'approve-sca', count: classified.length })
  }

  const needsOwnedPermRes = classified.some(
    (n) => n.resolverStrategy === 'to-owned-permres',
  )
  if (needsOwnedPermRes && !preflight.preExistingOwnedPermRes) {
    descriptors.push({ type: 'ensure-resolver' })
  }

  const totalBatches = getBatchCount(classified.length)
  const chunks = chunkArray(classified, MAX_NAMES_PER_BATCH)
  for (let i = 0; i < chunks.length; i++) {
    descriptors.push({
      type: 'migrate-batch',
      batch: i + 1,
      totalBatches,
      count: chunks[i]!.length,
    })
  }

  return descriptors
}

export const executeMigration = async (params: {
  domains: V1Domain[]
  migrationOwner: Address
  defaultResolver: Address
  wagmiConfig: WagmiConfig
  publicClient: PublicClient
  signer: Signer
  accountAddress: Address
  preflight?: MigrationPreflight
  onProgress: (progress: MigrationProgress) => void
}): Promise<MigrationResult> => {
  const {
    domains,
    migrationOwner,
    defaultResolver,
    wagmiConfig,
    publicClient,
    signer,
    accountAddress,
    preflight = EMPTY_PREFLIGHT,
    onProgress,
  } = params

  const { classified, ineligible } = classifyNames(domains, migrationOwner)
  if (classified.length === 0) {
    return {
      completed: 0,
      txHashes: [],
      ineligible,
      migratedNames: [],
    }
  }

  const groups = groupClassifiedNames(classified)
  const totalSteps = buildStepDescriptors(classified, groups, preflight).length
  const ctx: MigrationCtx = {
    wagmiConfig,
    publicClient,
    signer,
    accountAddress,
    migrationOwner,
    defaultResolver,
    tracker: createTracker(onProgress, totalSteps),
  }

  const approvalHashes = preflight.skipApprovalPhase
    ? []
    : await approveSCAIfNeeded(ctx, groups)

  const namesToOwnedPermRes = classified.filter(
    (n) => n.resolverStrategy === 'to-owned-permres',
  )

  let ownedPermRes: Address | null = preflight.preExistingOwnedPermRes
  if (namesToOwnedPermRes.length > 0 && !ownedPermRes) {
    ctx.tracker.emit('Setting up your v2 resolver', PENDING_TX_HASH)
    ownedPermRes = await ensureOwnedPermRes({
      eoa: ctx.migrationOwner,
      wagmiConfig: ctx.wagmiConfig,
      publicClient: ctx.publicClient,
    })
    ctx.tracker.next()
  }

  let profiles = new Map<Hex, Profile>()
  if (namesToOwnedPermRes.length > 0 && !preflight.skipFetchProfilesPhase) {
    profiles = await fetchV1Profiles({
      names: namesToOwnedPermRes
        .filter((n) => n.v1ResolverAddress)
        .map((n) => ({
          nodeHex: namehash(n.domain.name) as Hex,
          v1ResolverAddress: n.v1ResolverAddress as Address,
        })),
      publicClient: ctx.publicClient,
    })
  }

  ctx.tracker.emit(`Preparing migration for ${classified.length} name(s)`)

  const notReservedSet = new Set<string>()
  const twoLDs = classified.filter(is2LD)
  if (twoLDs.length > 0) {
    const { notReserved } = await filterNotReserved(publicClient, [...twoLDs])
    for (const name of notReserved) {
      notReservedSet.add(name.domain.name)
    }
  }

  const parentRegistries =
    groups.childNames.size > 0
      ? await resolveParentRegistries(publicClient, groups.childNames)
      : new Map<string, Address>()

  for (const [parentName, _children] of groups.childNames) {
    const registry = parentRegistries.get(parentName) ?? zeroAddress
    if (registry === zeroAddress) {
      throw new MigrationError({
        cause: new Error(
          `Parent "${parentName}" has not been migrated yet. Migrate the parent first.`,
        ),
        step: `Subnames under ${parentName}`,
      })
    }
  }

  const nameChunks = chunkArray(classified, MAX_NAMES_PER_BATCH)
  const totalBatches = nameChunks.length
  const allHashes: Hex[] = [...approvalHashes]

  for (let i = 0; i < nameChunks.length; i++) {
    const chunk = nameChunks[i]!
    const batchNum = i + 1

    ctx.tracker.emit(
      `Upgrading batch ${batchNum}/${totalBatches} (${chunk.length} names)`,
    )

    const batchCalls: ZeroDevCall[] = []

    const chunkTwoLDs = chunk.filter(
      (n) => is2LD(n) && notReservedSet.has(n.domain.name),
    )
    if (chunkTwoLDs.length > 0) {
      batchCalls.push(...buildPreMigrateCalls(chunkTwoLDs))
    }

    const transferCalls = buildAllTransferCalls({
      classified: chunk,
      migrationOwner,
      defaultResolver,
      ownedPermRes,
      parentRegistries,
    })

    let calls = transferCalls
    if (ownedPermRes) {
      const batchProfiles = new Map<Hex, Profile>()
      for (const name of chunk) {
        if (name.resolverStrategy !== 'to-owned-permres') continue
        const node = namehash(name.domain.name) as Hex
        const entry = profiles.get(node.toLowerCase() as Hex)
        if (entry) batchProfiles.set(node, entry)
      }
      const replay = buildProfileReplayCall({
        resolver: ownedPermRes,
        profiles: batchProfiles,
      })
      if (replay) calls = [...transferCalls, replay]
    }

    batchCalls.push(...calls)

    batchCalls.push(...buildRoleGrantCalls(chunk))

    try {
      const hash = await submitBatchedUserOp(
        ctx,
        batchCalls,
        `Migrate batch ${batchNum}/${totalBatches} (${chunk.length} names)`,
      )

      allHashes.push(hash)
      ctx.tracker.next()
      ctx.tracker.emit(`Batch ${batchNum}/${totalBatches} complete!`, hash)
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.toLowerCase().includes('user rejected')
      ) {
        throw new MigrationUserRejectedError({
          step: `Batch ${batchNum}/${totalBatches}`,
        })
      }
      throw new MigrationError({
        cause: error,
        step: `Batch ${batchNum}/${totalBatches}`,
      })
    }
  }

  const migratedNames = classified.map((c) => c.domain.name)

  return {
    completed: classified.length,
    txHashes: allHashes,
    ineligible,
    migratedNames,
  }
}

export const getMigrationStepInfo = (
  domains: V1Domain[],
  ownerAddress: Address,
  preflight: MigrationPreflight = EMPTY_PREFLIGHT,
): {
  stepCount: number
  stepDescriptors: MigrationStepDescriptor[]
  ineligible: IneligibleName[]
} => {
  const { classified, ineligible } = classifyNames(domains, ownerAddress)
  const groups = groupClassifiedNames(classified)
  const descriptors = buildStepDescriptors(classified, groups, preflight)

  return {
    stepCount: descriptors.length,
    stepDescriptors: descriptors,
    ineligible,
  }
}
