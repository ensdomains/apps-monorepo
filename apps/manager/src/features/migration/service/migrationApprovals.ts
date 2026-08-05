import { getDestinationContracts } from '@ens-apps/smart-account'
import type { Call } from '@ens-apps/transaction-manager'
import { readContracts, type Config as WagmiConfig } from '@wagmi/core'
import {
  type Address,
  encodeFunctionData,
  erc721Abi,
  isAddress,
  isAddressEqual,
  type PublicClient,
  zeroAddress,
} from 'viem'
import { OPERATOR_APPROVAL_ABI } from '@/features/migration/contracts/abis'
import {
  V1_CONTRACTS,
  V2_CONTRACTS,
} from '@/features/migration/contracts/addresses'
import { sepoliaWithEns } from '@/lib/wagmi'

const LEGACY_MIGRATION_HELPER = getDestinationContracts(
  sepoliaWithEns.id,
).migrationHelper

export type MigrationApprovalNeeds = {
  readonly hasUnwrapped: boolean
  readonly unwrappedTokenIds: readonly bigint[]
  readonly hasWrapped: boolean
  readonly requiresManagerRestoration: boolean
}

export type MigrationTokenApprovalStatus = {
  readonly tokenId: bigint
  readonly approved: boolean
}

export type MigrationApprovalStatus = {
  readonly baseRegistrarHcaApproved: boolean
  readonly unwrappedTokenApprovals: readonly MigrationTokenApprovalStatus[]
  readonly nameWrapperHcaApproved: boolean
  readonly ethRegistryHcaApproved: boolean
}

export type MigrationOperatorApprovalId =
  | 'base-registrar:hca'
  | 'name-wrapper:hca'
  | 'eth-registry:hca'

export type LegacyMigrationHelperApprovalId =
  | 'base-registrar:migration-helper'
  | 'name-wrapper:migration-helper'

export type MigrationApprovalId =
  | MigrationOperatorApprovalId
  | LegacyMigrationHelperApprovalId
  | 'base-registrar:hca-token'

export type MigrationOperatorApproval = {
  readonly kind: 'operator'
  readonly id: MigrationOperatorApprovalId | LegacyMigrationHelperApprovalId
  readonly contractAddress: Address
  readonly operatorAddress: Address
}

export type MigrationTokenApproval = {
  readonly kind: 'erc721-token'
  readonly id: 'base-registrar:hca-token'
  readonly contractAddress: Address
  readonly operatorAddress: Address
  readonly tokenId: bigint
}

/**
 * A missing permission required by a direct HCA migration.
 *
 * Plans contain only HCA permissions that were absent at preflight. The two
 * legacy helper ids can only be reconstructed from the v1 cleanup ledger; the
 * planner never emits them and grant-call construction rejects them.
 */
export type MigrationApproval =
  | MigrationOperatorApproval
  | MigrationTokenApproval

const LEGACY_HELPER_APPROVAL_IDS = [
  'base-registrar:migration-helper',
  'name-wrapper:migration-helper',
] as const satisfies readonly LegacyMigrationHelperApprovalId[]

export const isLegacyMigrationHelperApproval = (
  approval: MigrationApproval,
): approval is MigrationOperatorApproval & {
  readonly id: LegacyMigrationHelperApprovalId
} => (LEGACY_HELPER_APPROVAL_IDS as readonly string[]).includes(approval.id)

/**
 * Whether a successful migration normally needs a separate cleanup wallet
 * transaction. ERC-721 token approvals clear automatically on transfer, but
 * remain ledger-tracked so a reverted migration can explicitly clear them.
 */
export const migrationApprovalNeedsExplicitCleanup = (
  approval: MigrationApproval,
): boolean => approval.kind === 'operator'

/** Rebuild a persisted permission from the current trusted deployment data. */
export const migrationApprovalForId = (params: {
  readonly id: MigrationApprovalId
  readonly hcaAddress: Address
  readonly helperAddress?: Address
  readonly tokenId?: bigint
}): MigrationApproval => {
  const helperAddress = params.helperAddress ?? LEGACY_MIGRATION_HELPER
  switch (params.id) {
    case 'base-registrar:migration-helper':
      return {
        kind: 'operator',
        id: params.id,
        contractAddress: V1_CONTRACTS.BaseRegistrar,
        operatorAddress: helperAddress,
      }
    case 'base-registrar:hca':
      return {
        kind: 'operator',
        id: params.id,
        contractAddress: V1_CONTRACTS.BaseRegistrar,
        operatorAddress: params.hcaAddress,
      }
    case 'base-registrar:hca-token': {
      if (params.tokenId === undefined) {
        throw new Error('An ERC-721 migration approval requires a token id')
      }
      return {
        kind: 'erc721-token',
        id: params.id,
        contractAddress: V1_CONTRACTS.BaseRegistrar,
        operatorAddress: params.hcaAddress,
        tokenId: params.tokenId,
      }
    }
    case 'name-wrapper:migration-helper':
      return {
        kind: 'operator',
        id: params.id,
        contractAddress: V1_CONTRACTS.NameWrapper,
        operatorAddress: helperAddress,
      }
    case 'name-wrapper:hca':
      return {
        kind: 'operator',
        id: params.id,
        contractAddress: V1_CONTRACTS.NameWrapper,
        operatorAddress: params.hcaAddress,
      }
    case 'eth-registry:hca':
      return {
        kind: 'operator',
        id: params.id,
        contractAddress: V2_CONTRACTS.ETHRegistry,
        operatorAddress: params.hcaAddress,
      }
  }
}

type OperatorStatusKey = Exclude<
  keyof MigrationApprovalStatus,
  'unwrappedTokenApprovals'
>
type ApprovalRead =
  | {
      readonly kind: 'operator'
      readonly key: OperatorStatusKey
      readonly contractAddress: Address
      readonly operatorAddress: Address
    }
  | {
      readonly kind: 'erc721-token'
      readonly tokenId: bigint
    }
type ApprovalContract = Parameters<typeof readContracts>[1]['contracts'][number]

export const migrationApprovalKey = (approval: MigrationApproval): string =>
  approval.kind === 'erc721-token'
    ? `${approval.id}:${approval.tokenId}`
    : `${approval.contractAddress.toLowerCase()}:${approval.operatorAddress.toLowerCase()}`

const uniqueTokenIds = (tokenIds: readonly bigint[]): readonly bigint[] => [
  ...new Set(tokenIds),
]

export const checkMigrationApprovals = async (params: {
  readonly eoa: Address
  readonly hcaAddress: Address
  readonly needs: MigrationApprovalNeeds
  readonly wagmiConfig: WagmiConfig
}): Promise<MigrationApprovalStatus> => {
  const { eoa, hcaAddress, needs, wagmiConfig } = params
  const tokenIds = uniqueTokenIds(needs.unwrappedTokenIds)
  const reads: ApprovalRead[] = []

  if (needs.hasUnwrapped) {
    reads.push({
      kind: 'operator',
      key: 'baseRegistrarHcaApproved',
      contractAddress: V1_CONTRACTS.BaseRegistrar,
      operatorAddress: hcaAddress,
    })
    reads.push(
      ...tokenIds.map(
        (tokenId): ApprovalRead => ({ kind: 'erc721-token', tokenId }),
      ),
    )
  }

  if (needs.hasWrapped) {
    reads.push({
      kind: 'operator',
      key: 'nameWrapperHcaApproved',
      contractAddress: V1_CONTRACTS.NameWrapper,
      operatorAddress: hcaAddress,
    })
  }

  if (needs.requiresManagerRestoration) {
    reads.push({
      kind: 'operator',
      key: 'ethRegistryHcaApproved',
      contractAddress: V2_CONTRACTS.ETHRegistry,
      operatorAddress: hcaAddress,
    })
  }

  const initialStatus: MigrationApprovalStatus = {
    baseRegistrarHcaApproved: !needs.hasUnwrapped,
    unwrappedTokenApprovals: tokenIds.map((tokenId) => ({
      tokenId,
      approved: !needs.hasUnwrapped,
    })),
    nameWrapperHcaApproved: !needs.hasWrapped,
    ethRegistryHcaApproved: !needs.requiresManagerRestoration,
  }
  if (reads.length === 0) return initialStatus

  const contracts: ApprovalContract[] = reads.map((read) =>
    read.kind === 'operator'
      ? {
          address: read.contractAddress,
          abi: OPERATOR_APPROVAL_ABI,
          functionName: 'isApprovedForAll',
          args: [eoa, read.operatorAddress],
        }
      : {
          address: V1_CONTRACTS.BaseRegistrar,
          abi: erc721Abi,
          functionName: 'getApproved',
          args: [read.tokenId],
        },
  )
  const results = (await readContracts(wagmiConfig, {
    contracts,
    allowFailure: false,
    batchSize: 0,
  })) as readonly unknown[]

  let baseRegistrarHcaApproved = initialStatus.baseRegistrarHcaApproved
  let nameWrapperHcaApproved = initialStatus.nameWrapperHcaApproved
  let ethRegistryHcaApproved = initialStatus.ethRegistryHcaApproved
  const tokenApprovals = new Map(
    initialStatus.unwrappedTokenApprovals.map(({ tokenId, approved }) => [
      tokenId,
      approved,
    ]),
  )

  for (const [index, result] of results.entries()) {
    const read = reads[index]
    if (!read) continue
    if (read.kind === 'erc721-token') {
      tokenApprovals.set(
        read.tokenId,
        typeof result === 'string' &&
          isAddress(result) &&
          isAddressEqual(result, hcaAddress),
      )
      continue
    }
    const approved = result === true
    switch (read.key) {
      case 'baseRegistrarHcaApproved':
        baseRegistrarHcaApproved = approved
        break
      case 'nameWrapperHcaApproved':
        nameWrapperHcaApproved = approved
        break
      case 'ethRegistryHcaApproved':
        ethRegistryHcaApproved = approved
        break
    }
  }

  return {
    baseRegistrarHcaApproved,
    unwrappedTokenApprovals: tokenIds.map((tokenId) => ({
      tokenId,
      approved: tokenApprovals.get(tokenId) ?? false,
    })),
    nameWrapperHcaApproved,
    ethRegistryHcaApproved,
  }
}

export const planMigrationApprovals = (params: {
  readonly hcaAddress: Address
  readonly needs: MigrationApprovalNeeds
  readonly status: MigrationApprovalStatus
}): readonly MigrationApproval[] => {
  const { hcaAddress, needs, status } = params
  const approvals: MigrationApproval[] = []
  const tokenStatus = new Map(
    status.unwrappedTokenApprovals.map(({ tokenId, approved }) => [
      tokenId,
      approved,
    ]),
  )
  const tokenIds = uniqueTokenIds(needs.unwrappedTokenIds)
  const missingTokenIds = tokenIds.filter(
    (tokenId) => !tokenStatus.get(tokenId),
  )

  if (needs.hasUnwrapped && !status.baseRegistrarHcaApproved) {
    if (tokenIds.length > 0 && missingTokenIds.length <= 2) {
      approvals.push(
        ...missingTokenIds.map((tokenId) =>
          migrationApprovalForId({
            id: 'base-registrar:hca-token',
            hcaAddress,
            tokenId,
          }),
        ),
      )
    } else {
      approvals.push(
        migrationApprovalForId({ id: 'base-registrar:hca', hcaAddress }),
      )
    }
  }
  if (needs.hasWrapped && !status.nameWrapperHcaApproved) {
    approvals.push(
      migrationApprovalForId({ id: 'name-wrapper:hca', hcaAddress }),
    )
  }
  if (needs.requiresManagerRestoration && !status.ethRegistryHcaApproved) {
    approvals.push(
      migrationApprovalForId({ id: 'eth-registry:hca', hcaAddress }),
    )
  }

  return approvals
}

export const buildMigrationApprovalCall = (
  approval: MigrationApproval,
  approved: boolean,
): Call => {
  if (approved && isLegacyMigrationHelperApproval(approval)) {
    throw new Error('Legacy MigrationHelper permissions are cleanup-only')
  }
  if (approval.kind === 'erc721-token') {
    return {
      to: approval.contractAddress,
      data: encodeFunctionData({
        abi: erc721Abi,
        functionName: 'approve',
        args: [
          approved ? approval.operatorAddress : zeroAddress,
          approval.tokenId,
        ],
      }),
      value: 0n,
    }
  }
  return {
    to: approval.contractAddress,
    data: encodeFunctionData({
      abi: OPERATOR_APPROVAL_ABI,
      functionName: 'setApprovalForAll',
      args: [approval.operatorAddress, approved],
    }),
    value: 0n,
  }
}

export const buildMigrationApprovalCalls = (
  approvals: readonly MigrationApproval[],
): readonly Call[] =>
  approvals.map((approval) => buildMigrationApprovalCall(approval, true))

/** Add a potentially submitted permission to the cleanup ledger. */
export const trackCreatedMigrationApproval = (
  created: readonly MigrationApproval[],
  submittedApproval: MigrationApproval,
): readonly MigrationApproval[] => {
  const key = migrationApprovalKey(submittedApproval)
  return created.some((approval) => migrationApprovalKey(approval) === key)
    ? created
    : [...created, submittedApproval]
}

/** Read whether a ledger entry is still active before sending cleanup. */
export const checkMigrationApprovalActive = async (params: {
  readonly approval: MigrationApproval
  readonly owner: Address
  readonly publicClient: Pick<PublicClient, 'readContract'>
}): Promise<boolean> => {
  const { approval, owner, publicClient } = params
  if (approval.kind === 'erc721-token') {
    const approvedAddress = await publicClient.readContract({
      address: approval.contractAddress,
      abi: erc721Abi,
      functionName: 'getApproved',
      args: [approval.tokenId],
    })
    return isAddressEqual(approvedAddress, approval.operatorAddress)
  }
  return publicClient.readContract({
    address: approval.contractAddress,
    abi: OPERATOR_APPROVAL_ABI,
    functionName: 'isApprovedForAll',
    args: [owner, approval.operatorAddress],
  })
}

/** Build explicit recovery cleanup, in reverse submission order. */
export const buildMigrationCleanupCalls = (
  createdApprovals: readonly MigrationApproval[],
): readonly Call[] =>
  [...createdApprovals]
    .reverse()
    .map((approval) => buildMigrationApprovalCall(approval, false))
